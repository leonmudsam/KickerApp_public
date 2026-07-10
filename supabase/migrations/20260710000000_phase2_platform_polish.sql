-- PHASE 2 — Plattform-Politur (Plan §13): Liga schließen (owner-only),
-- atomarer Ownership-Transfer, Claim-Hygiene bei Austritt/Rauswurf.
-- Rollen ändern & Rauswurf laufen weiter über direkte Tabellen-Updates
-- (Policies aus Phase 1 decken das ab und members_audit loggt sie).

-- ── Guard: leagues.deleted_at setzt nur der Owner ───────────────────────
-- Die UPDATE-Policy erlaubt owner UND admin (Name/Settings/join_enabled) —
-- Schließen ist aber owner-only (Plan §5). auth.uid() IS NULL = Service-
-- Role/Wartung → durchlassen (Trigger feuern auch für Superuser-Fixes).

create or replace function public.leagues_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.created_by <> old.created_by then
    raise exception 'created_by ist unveraenderlich';
  end if;
  if new.deleted_at is distinct from old.deleted_at
     and auth.uid() is not null
     and coalesce(public.member_role(old.id), '') <> 'owner' then
    raise exception 'Nur der Owner kann die Liga schliessen';
  end if;
  return new;
end;
$$;

create trigger leagues_guard before update on public.leagues
  for each row execute function public.leagues_guard();

-- ── RPC: Liga schließen (Soft-Delete, owner-only) ───────────────────────
-- Verschwindet von allen Home-Screens, Joins sind blockiert, Daten bleiben
-- (DSGVO-Purge-Job später). Invites werden mitrevoked (Belt & Braces —
-- join_league prüft deleted_at ohnehin).

create or replace function public.close_league(p_league_id uuid)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(public.member_role(p_league_id), '') <> 'owner' then
    raise exception 'forbidden';
  end if;
  update public.leagues
    set deleted_at = now(), join_enabled = false
    where id = p_league_id and deleted_at is null;
  update public.league_invites set revoked_at = now()
    where league_id = p_league_id and revoked_at is null;
end;
$$;

-- ── RPC: Ownership atomar übertragen ────────────────────────────────────
-- Die Policy-Matrix erlaubt dem Owner keine Änderung der eigenen Zeile —
-- der Transfer wäre sonst ein Zwei-Personen-Handshake (fremde Zeile auf
-- owner setzen, der Neue demotet den Alten). Diese RPC macht beides in
-- einer Transaktion; members_audit loggt beide Updates.

create or replace function public.transfer_ownership(p_league_id uuid, p_new_owner uuid)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(public.member_role(p_league_id), '') <> 'owner' then
    raise exception 'forbidden';
  end if;
  if p_new_owner = v_uid then return; end if;
  if not exists (select 1 from public.league_members
                 where league_id = p_league_id and user_id = p_new_owner) then
    raise exception 'not_a_member';
  end if;
  update public.league_members set role = 'owner'
    where league_id = p_league_id and user_id = p_new_owner;
  update public.league_members set role = 'admin'
    where league_id = p_league_id and user_id = v_uid;
end;
$$;

-- ── Claim-Hygiene: Austritt/Rauswurf gibt geclaimte Spieler frei ────────
-- Spielerzeilen gehören der Liga (nie einem Login) — ein Ex-Mitglied darf
-- keinen Spieler „besetzen". Deckt leave_league (RPC-Delete) UND den
-- direkten Kick-Delete ab; players_audit loggt die Freigabe.

create or replace function public.member_removed_cleanup()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.players set claimed_by = null
    where league_id = old.league_id and claimed_by = old.user_id;
  return null;
end;
$$;

create trigger members_claim_cleanup after delete on public.league_members
  for each row execute function public.member_removed_cleanup();

-- ── Grants ──────────────────────────────────────────────────────────────

revoke execute on function
  public.close_league(uuid),
  public.transfer_ownership(uuid, uuid)
from public, anon;
grant execute on function
  public.close_league(uuid),
  public.transfer_ownership(uuid, uuid)
to authenticated;

-- Trigger-Funktionen sind nicht für REST-Aufrufe gedacht (Security-Advisor)
revoke execute on function
  public.leagues_guard(),
  public.member_removed_cleanup()
from public, anon, authenticated;

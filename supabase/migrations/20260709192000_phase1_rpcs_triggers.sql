-- PHASE 1 — RPCs (SECURITY DEFINER) und Trigger (Plan §5).
-- RPCs sind die einzigen Schreibwege für leagues/league_members/
-- league_invites; Trigger erzwingen Datenintegrität (Same-League-Matches,
-- Claim-Regeln), schreiben das Audit-Log und bumpen leagues.rev für die
-- Cache-Invalidierung.

-- ── Invite-Code-Generator (nur intern, kryptographischer Zufall) ────────
-- Crockford-Base32 ohne I/L/O/U: 10 Zeichen ≈ 50 Bit

create or replace function public.gen_invite_code()
returns text
language plpgsql volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  b bytea := extensions.gen_random_bytes(10);
  res text := '';
  i int;
begin
  for i in 0..9 loop
    res := res || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return res;
end;
$$;

revoke execute on function public.gen_invite_code() from public, anon, authenticated;

-- ── RPC: Liga erstellen ─────────────────────────────────────────────────
-- Liga + Owner-Membership + erster Invite-Code in einer Transaktion.

create or replace function public.create_league(p_name text, p_settings jsonb default '{}'::jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_league public.leagues;
  v_code text;
  i int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    p_settings := '{}'::jsonb;
  end if;
  -- Spam-Schutz: Per-User-Cap (Plan §5)
  if (select count(*) from public.leagues
      where created_by = v_uid and deleted_at is null) >= 10 then
    raise exception 'league_limit_reached';
  end if;
  insert into public.leagues (name, created_by, settings)
  values (btrim(p_name), v_uid, p_settings)
  returning * into v_league;
  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, v_uid, 'owner');
  for i in 1..5 loop
    begin
      v_code := public.gen_invite_code();
      insert into public.league_invites (league_id, code, created_by)
      values (v_league.id, v_code, v_uid);
      exit;
    exception when unique_violation then
      if i = 5 then raise; end if;
    end;
  end loop;
  return jsonb_build_object('league', to_jsonb(v_league), 'invite_code', v_code);
end;
$$;

-- ── RPC: Liga per Code beitreten ────────────────────────────────────────
-- Einzige Probe-Fläche für Codes: rate-limitiert, uniformer Fehler.
-- Keine SELECT-Policy erlaubt Code-Lookups → Enumeration unmöglich.
-- WICHTIG: Fehler kommen als {"error": …}-Rückgabe, NICHT als Exception —
-- eine Exception würde die Transaktion samt join_attempts-Eintrag
-- zurückrollen und das Rate-Limit würde Fehlversuche nie zählen.

create or replace function public.join_league(p_code text)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_invite public.league_invites;
  v_league public.leagues;
  v_existing boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  -- Normalisieren: Großschreibung, Trenner raus, Crockford-Aliase I/L→1, O→0
  v_code := translate(upper(coalesce(p_code, '')), 'ILO -', '110');
  -- Rate-Limit: max. 10 Versuche/Stunde/User (Defense-in-Depth, ~50-Bit-Codes)
  delete from public.join_attempts
    where user_id = v_uid and attempted_at < now() - interval '1 day';
  if (select count(*) from public.join_attempts
      where user_id = v_uid and attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  insert into public.join_attempts (user_id, code_prefix) values (v_uid, left(v_code, 4));
  select li.* into v_invite
    from public.league_invites li
    join public.leagues l on l.id = li.league_id
    where li.code = v_code
      and li.revoked_at is null
      and (li.expires_at is null or li.expires_at > now())
      and l.join_enabled
      and l.deleted_at is null;
  if not found then
    return jsonb_build_object('error', 'invalid_code');  -- uniform für ungültig/revoked/geschlossen
  end if;
  select exists (
    select 1 from public.league_members
    where league_id = v_invite.league_id and user_id = v_uid
  ) into v_existing;
  if not v_existing then
    insert into public.league_members (league_id, user_id, role)
    values (v_invite.league_id, v_uid, 'member');
    update public.league_invites set use_count = use_count + 1 where id = v_invite.id;
  end if;
  select * into v_league from public.leagues where id = v_invite.league_id;
  return jsonb_build_object('league', to_jsonb(v_league), 'already_member', v_existing);
end;
$$;

-- ── RPC: Invite-Code rotieren (owner/admin) — alter Link stirbt sofort ──

create or replace function public.rotate_invite(p_league_id uuid)
returns text
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  i int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(public.member_role(p_league_id), '') not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;
  update public.league_invites set revoked_at = now()
    where league_id = p_league_id and revoked_at is null;
  for i in 1..5 loop
    begin
      v_code := public.gen_invite_code();
      insert into public.league_invites (league_id, code, created_by)
      values (p_league_id, v_code, v_uid);
      exit;
    exception when unique_violation then
      if i = 5 then raise; end if;
    end;
  end loop;
  return v_code;
end;
$$;

-- ── RPC: Liga verlassen ─────────────────────────────────────────────────
-- Owner kann nur gehen, wenn er der Letzte ist (dann schließt die Liga);
-- sonst erst Ownership übertragen oder Liga schließen.

create or replace function public.leave_league(p_league_id uuid)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select role into v_role from public.league_members
    where league_id = p_league_id and user_id = v_uid;
  if v_role is null then return; end if;
  if v_role = 'owner' then
    if exists (select 1 from public.league_members
               where league_id = p_league_id and user_id <> v_uid) then
      raise exception 'owner_must_transfer_or_close';
    end if;
    update public.leagues set deleted_at = now() where id = p_league_id;
  end if;
  delete from public.league_members where league_id = p_league_id and user_id = v_uid;
end;
$$;

revoke execute on function
  public.create_league(text, jsonb),
  public.join_league(text),
  public.rotate_invite(uuid),
  public.leave_league(uuid)
from public, anon;
grant execute on function
  public.create_league(text, jsonb),
  public.join_league(text),
  public.rotate_invite(uuid),
  public.leave_league(uuid)
to authenticated;

-- ── Trigger: Integritäts-Guards ─────────────────────────────────────────

-- players: league_id unveränderlich; claimed_by nur auf die eigene
-- auth.uid() setzbar (Übernahme erlaubt — auditiert; Freigeben = null)
create or replace function public.players_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.league_id <> old.league_id then
    raise exception 'league_id ist unveraenderlich';
  end if;
  if new.claimed_by is distinct from old.claimed_by
     and new.claimed_by is not null
     and new.claimed_by <> (select auth.uid()) then
    raise exception 'claimed_by kann nur auf den eigenen Account gesetzt werden';
  end if;
  return new;
end;
$$;

create trigger players_guard before update on public.players
  for each row execute function public.players_guard();

-- matches: alle 4 Spieler distinct und aus der Liga des Matches;
-- league_id unveränderlich; updated_at pflegen
create or replace function public.matches_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  cnt int;
begin
  if tg_op = 'UPDATE' then
    if new.league_id <> old.league_id then
      raise exception 'league_id ist unveraenderlich';
    end if;
    new.updated_at := now();
  end if;
  if new.a1 in (new.a2, new.b1, new.b2)
     or new.a2 in (new.b1, new.b2)
     or new.b1 = new.b2 then
    raise exception 'Spieler muessen unterschiedlich sein';
  end if;
  select count(*) into cnt from public.players p
    where p.id in (new.a1, new.a2, new.b1, new.b2)
      and p.league_id = new.league_id;
  if cnt <> 4 then
    raise exception 'Alle Spieler muessen zur Liga des Matches gehoeren';
  end if;
  return new;
end;
$$;

create trigger matches_guard before insert or update on public.matches
  for each row execute function public.matches_guard();

-- ── Trigger: Audit-Log ──────────────────────────────────────────────────
-- Nur redaktionelle Änderungen loggen (Score-Edit, Rename, Claim, Delete,
-- Settings, Rollen) — NICHT die Recalc-Wellen (deltas/elo/atk), die nach
-- jedem Match hunderte Zeilen anfassen.

create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  r_old jsonb := to_jsonb(old);
  r_new jsonb;
  v_league uuid;
  v_entity_id text;
begin
  if tg_op <> 'DELETE' then r_new := to_jsonb(new); end if;
  if tg_table_name = 'leagues' then
    v_league := coalesce(r_new ->> 'id', r_old ->> 'id')::uuid;
    v_entity_id := v_league::text;
  elsif tg_table_name = 'league_members' then
    v_league := coalesce(r_new ->> 'league_id', r_old ->> 'league_id')::uuid;
    v_entity_id := coalesce(r_new ->> 'user_id', r_old ->> 'user_id');
  else
    v_league := coalesce(r_new ->> 'league_id', r_old ->> 'league_id')::uuid;
    v_entity_id := coalesce(r_new ->> 'id', r_old ->> 'id');
  end if;
  insert into public.audit_log (league_id, actor, action, entity, entity_id, payload)
  values (
    v_league, auth.uid(), lower(tg_op), tg_table_name, v_entity_id,
    jsonb_strip_nulls(jsonb_build_object(
      'old', r_old - 'deltas', 'new', r_new - 'deltas'))
  );
  return null;
end;
$$;

create trigger matches_audit after update on public.matches
  for each row
  when ((old.a1, old.a2, old.b1, old.b2,
         old.a1_pos, old.a2_pos, old.b1_pos, old.b2_pos,
         old.score_a, old.score_b, old.winner, old.deleted_at)
        is distinct from
        (new.a1, new.a2, new.b1, new.b2,
         new.a1_pos, new.a2_pos, new.b1_pos, new.b2_pos,
         new.score_a, new.score_b, new.winner, new.deleted_at))
  execute function public.audit_row_change();

create trigger players_audit after update on public.players
  for each row
  when ((old.name, old.hidden, old.avatar_id, old.claimed_by, old.deleted_at)
        is distinct from
        (new.name, new.hidden, new.avatar_id, new.claimed_by, new.deleted_at))
  execute function public.audit_row_change();

create trigger leagues_audit after update on public.leagues
  for each row
  when ((old.name, old.settings, old.join_enabled, old.deleted_at)
        is distinct from
        (new.name, new.settings, new.join_enabled, new.deleted_at))
  execute function public.audit_row_change();

create trigger members_audit after update or delete on public.league_members
  for each row execute function public.audit_row_change();

-- ── Trigger: rev-Bump für Cache-Invalidierung ───────────────────────────
-- Ein Match-EDIT oder -Soft-Delete macht per Delta-Sync gecachte Clients
-- stale → leagues.rev bumpen, Client macht Full-Resync. Neue Matches
-- brauchen keinen Bump (Delta-Sync über created_at findet sie).

create or replace function public.bump_league_rev()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.leagues set rev = rev + 1 where id = new.league_id;
  return null;
end;
$$;

create trigger matches_rev_bump after update on public.matches
  for each row
  when ((old.a1, old.a2, old.b1, old.b2,
         old.a1_pos, old.a2_pos, old.b1_pos, old.b2_pos,
         old.score_a, old.score_b, old.winner, old.deleted_at)
        is distinct from
        (new.a1, new.a2, new.b1, new.b2,
         new.a1_pos, new.a2_pos, new.b1_pos, new.b2_pos,
         new.score_a, new.score_b, new.winner, new.deleted_at))
  execute function public.bump_league_rev();

-- Trigger-Funktionen sind nicht für REST-Aufrufe gedacht (Security-Advisor):
-- Trigger feuern unabhängig von EXECUTE-Rechten des DML-Users.
revoke execute on function
  public.audit_row_change(),
  public.bump_league_rev(),
  public.matches_guard(),
  public.players_guard()
from public, anon, authenticated;

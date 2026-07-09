-- PHASE 1 — RLS-Policy-Matrix (Plan §5).
-- Grundprinzip: Mitgliedschaft (league_members) ist das einzige Tor zu
-- Liga-Daten. Ohne Mitgliedschaft liefert jede Tabelle leere Ergebnisse —
-- auch mit manipulierten API-Calls. Alle Policies gelten für `authenticated`
-- (anonyme Sign-ins tragen ebenfalls die Rolle authenticated); der nackte
-- anon-Key ohne Session sieht nichts.

-- ── Helper (SECURITY DEFINER: umgehen RLS auf league_members und
--    verhindern damit Policy-Rekursion; STABLE: einmal pro Statement) ────

create or replace function public.is_member(l uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.league_members
    where league_id = l and user_id = (select auth.uid())
  );
$$;

create or replace function public.member_role(l uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.league_members
  where league_id = l and user_id = (select auth.uid());
$$;

revoke execute on function public.is_member(uuid), public.member_role(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.member_role(uuid) to authenticated;

-- ── Phase-0-Permissiv-Policies ersetzen ─────────────────────────────────

drop policy if exists "phase0_players_all" on public.players;
drop policy if exists "phase0_matches_all" on public.matches;
drop policy if exists "phase0_seasons_all" on public.seasons;
drop policy if exists "phase0_stories_select" on public.stories;
drop policy if exists "phase0_stories_insert" on public.stories;
drop policy if exists "phase0_stories_update" on public.stories;
drop policy if exists "phase0_stories_delete_old" on public.stories;

-- ── leagues ─────────────────────────────────────────────────────────────
-- INSERT nur via RPC create_league; DELETE nie (Schließen = Soft-Delete
-- per UPDATE deleted_at, danach sperrt USING weitere Änderungen)

create policy leagues_select on public.leagues
  for select to authenticated
  using (public.is_member(id));

create policy leagues_update on public.leagues
  for update to authenticated
  using (public.member_role(id) in ('owner', 'admin') and deleted_at is null)
  with check (public.member_role(id) in ('owner', 'admin'));

-- ── league_members ──────────────────────────────────────────────────────
-- INSERT nur via RPCs (create_league/join_league). Rollen ändert nur der
-- Owner und nie die eigene Zeile (Ownership-Transfer: erst den anderen zum
-- owner machen, der demotet dann den alten). Austritt: eigene Zeile löschen
-- (Owner nicht — der geht über leave_league); Rauswurf: owner/admin,
-- aber nie den Owner.

create policy members_select on public.league_members
  for select to authenticated
  using (public.is_member(league_id));

create policy members_update on public.league_members
  for update to authenticated
  using (public.member_role(league_id) = 'owner' and user_id <> (select auth.uid()))
  with check (public.member_role(league_id) = 'owner');

create policy members_delete on public.league_members
  for delete to authenticated
  using (
    (user_id = (select auth.uid()) and role <> 'owner')
    or (public.member_role(league_id) in ('owner', 'admin') and role <> 'owner')
  );

-- ── league_invites ──────────────────────────────────────────────────────
-- Jedes Mitglied darf den aktiven Code sehen und teilen (Splid-Ethos);
-- Erzeugen/Rotieren nur via RPC. Kein Lookup per Code möglich →
-- Code-Enumeration über PostgREST ausgeschlossen.

create policy invites_select on public.league_invites
  for select to authenticated
  using (public.is_member(league_id));

-- ── players ─────────────────────────────────────────────────────────────
-- Kein DELETE (Historie referenziert Spieler); Löschen = Soft-Delete per
-- UPDATE. Claim-Regeln (claimed_by nur auf die eigene auth.uid()) erzwingt
-- ein Trigger, weil WITH CHECK sonst jedes Update fremd-geclaimter
-- Spieler blockieren würde.

create policy players_select on public.players
  for select to authenticated
  using (public.is_member(league_id));

create policy players_insert on public.players
  for insert to authenticated
  with check (public.is_member(league_id));

create policy players_update on public.players
  for update to authenticated
  using (public.is_member(league_id))
  with check (public.is_member(league_id));

-- ── matches ─────────────────────────────────────────────────────────────
-- Jedes Mitglied trägt ein und darf korrigieren (Freundesgruppen-Ethos,
-- auditiert). Kein hartes DELETE; Löschen = UPDATE deleted_at.

create policy matches_select on public.matches
  for select to authenticated
  using (public.is_member(league_id));

create policy matches_insert on public.matches
  for insert to authenticated
  with check (public.is_member(league_id) and created_by = (select auth.uid()));

create policy matches_update on public.matches
  for update to authenticated
  using (public.is_member(league_id))
  with check (public.is_member(league_id));

-- ── seasons ─────────────────────────────────────────────────────────────
-- Idempotenter Rollover-Upsert durch den ersten Client im neuen Monat

create policy seasons_select on public.seasons
  for select to authenticated
  using (public.is_member(league_id));

create policy seasons_insert on public.seasons
  for insert to authenticated
  with check (public.is_member(league_id));

create policy seasons_update on public.seasons
  for update to authenticated
  using (public.is_member(league_id))
  with check (public.is_member(league_id));

-- ── stories ─────────────────────────────────────────────────────────────
-- Upsert ON CONFLICT DO NOTHING braucht nur INSERT; kein UPDATE.
-- DELETE nur für abgelaufene Einträge (Client-Cleanup wie bisher).

create policy stories_select on public.stories
  for select to authenticated
  using (public.is_member(league_id));

create policy stories_insert on public.stories
  for insert to authenticated
  with check (public.is_member(league_id));

create policy stories_delete_old on public.stories
  for delete to authenticated
  using (public.is_member(league_id) and expires_at < now());

-- ── league_entitlements ─────────────────────────────────────────────────
-- Lesen: Mitglieder (UI-Gating). Schreiben: nur Service-Role (keine Policy).

create policy entitlements_select on public.league_entitlements
  for select to authenticated
  using (public.is_member(league_id));

-- ── audit_log ───────────────────────────────────────────────────────────
-- Lesen: owner/admin. Schreiben: nur via SECURITY-DEFINER-Trigger.

create policy audit_select on public.audit_log
  for select to authenticated
  using (public.member_role(league_id) in ('owner', 'admin'));

-- join_attempts: RLS aktiv, bewusst NULL Policies — nur die RPC (SECURITY
-- DEFINER) liest/schreibt.

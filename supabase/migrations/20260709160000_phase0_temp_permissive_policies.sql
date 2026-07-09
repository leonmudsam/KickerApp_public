-- PHASE 0 (temporär): permissive Policies, damit die Single-Tenant-App
-- wie bisher mit dem anon-Key arbeiten kann. Entspricht dem Vertrauensmodell
-- der alten privaten Liga-DB. Wird in PHASE 1 vollständig durch das
-- Multi-Liga-RLS-Design ersetzt (league_members / is_member(...)).
-- Bereits angewendet auf Projekt ffpvdqebpbzdyaisovnm (09.07.2026, via MCP).

-- players: volle CRUD für anon (App legt an, versteckt, benennt um, löscht)
create policy "phase0_players_all" on public.players
  for all to anon, authenticated using (true) with check (true);

-- matches: volle CRUD (eintragen, editieren, löschen)
create policy "phase0_matches_all" on public.matches
  for all to anon, authenticated using (true) with check (true);

-- config: lesen + updaten (Elo-Formel-Panel), insert für Seed
create policy "phase0_config_all" on public.config
  for all to anon, authenticated using (true) with check (true);

-- seasons: lesen + upsert (Auto-Archivierung beim Monatswechsel)
create policy "phase0_seasons_all" on public.seasons
  for all to anon, authenticated using (true) with check (true);

-- stories: select/insert/update frei, DELETE nur für abgelaufene Einträge
-- (entspricht der dokumentierten stories_delete_old-Policy der alten DB)
create policy "phase0_stories_select" on public.stories
  for select to anon, authenticated using (true);
create policy "phase0_stories_insert" on public.stories
  for insert to anon, authenticated with check (true);
create policy "phase0_stories_update" on public.stories
  for update to anon, authenticated using (true) with check (true);
create policy "phase0_stories_delete_old" on public.stories
  for delete to anon, authenticated using (expires_at < now());

-- Realtime für den Stories-Feed (Publication muss die Tabelle enthalten,
-- sonst kommen postgres_changes-Events stillschweigend nie an — §11.8)
alter publication supabase_realtime add table public.stories;

-- Config-Seed: die App erwartet genau eine Zeile id=1 (Spaltendefaults)
insert into public.config (id) values (1) on conflict (id) do nothing;

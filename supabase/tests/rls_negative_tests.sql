-- RLS-NEGATIVTESTS (Plan „Verifikation Phase 1").
-- Läuft als postgres im SQL-Editor / via MCP. Simuliert zwei authentifizierte
-- User über set_config('request.jwt.claims') + SET LOCAL ROLE authenticated.
-- Erfolg = läuft ohne Fehler durch (am Ende ROLLBACK, DB bleibt unberührt).

begin;

do $$
declare
  u1 uuid := '11111111-1111-4111-8111-111111111111';
  u2 uuid := '22222222-2222-4222-8222-222222222222';
  r jsonb;
  lid uuid; lid2 uuid;
  code text;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  q1 uuid; q2 uuid; q3 uuid; q4 uuid;
  mid uuid;
  n int;
  i int;
begin
  -- Testuser anlegen (Rollback am Ende räumt auf)
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rlstest1@test.local', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rlstest2@test.local', now(), now());

  -- ═══ User 1: Liga + Spieler + Match ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.create_league('RLS-Testliga');
  lid := (r -> 'league' ->> 'id')::uuid;
  code := r ->> 'invite_code';
  if lid is null or length(code) <> 10 then
    raise exception 'create_league defekt: %', r;
  end if;
  insert into public.players (league_id, name) values (lid, 'A') returning id into p1;
  insert into public.players (league_id, name) values (lid, 'B') returning id into p2;
  insert into public.players (league_id, name) values (lid, 'C') returning id into p3;
  insert into public.players (league_id, name) values (lid, 'D') returning id into p4;
  insert into public.matches (league_id, a1, a1_pos, a2, a2_pos, b1, b1_pos, b2, b2_pos, score_a, score_b, winner)
  values (lid, p1, 'atk', p2, 'def', p3, 'atk', p4, 'def', 10, 5, 'A')
  returning id into mid;

  -- ═══ User 2 (Nicht-Mitglied): sieht NICHTS ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  select count(*) into n from public.leagues;         if n <> 0 then raise exception 'LEAK leagues'; end if;
  select count(*) into n from public.players;         if n <> 0 then raise exception 'LEAK players'; end if;
  select count(*) into n from public.matches;         if n <> 0 then raise exception 'LEAK matches'; end if;
  select count(*) into n from public.league_members;  if n <> 0 then raise exception 'LEAK members'; end if;
  select count(*) into n from public.league_invites;  if n <> 0 then raise exception 'LEAK invites'; end if;
  select count(*) into n from public.audit_log;       if n <> 0 then raise exception 'LEAK audit_log'; end if;
  select count(*) into n from public.join_attempts;   if n <> 0 then raise exception 'LEAK join_attempts'; end if;

  -- Nicht-Mitglied: Schreiben verboten
  begin
    insert into public.players (league_id, name) values (lid, 'Evil');
    raise exception 'FAIL: Nicht-Mitglied konnte Spieler anlegen';
  exception when sqlstate '42501' then null;
  end;
  update public.matches set score_b = 3 where id = mid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Nicht-Mitglied konnte Match editieren'; end if;

  -- Falscher Code: uniformer Fehler
  r := public.join_league('AAAAAAAAAA');
  if r ->> 'error' <> 'invalid_code' then raise exception 'FAIL: erwartete invalid_code, war %', r; end if;

  -- Rate-Limit: nach 10 Versuchen blockt auch der RICHTIGE Code
  for i in 1..9 loop
    perform public.join_league('AAAAAAAAAA');
  end loop;
  r := public.join_league(code);
  if r ->> 'error' <> 'rate_limited' then raise exception 'FAIL: Rate-Limit greift nicht: %', r; end if;

  -- ═══ User 2 tritt bei (Code normalisiert: klein + Bindestrich) ═══
  reset role;
  delete from public.join_attempts where user_id = u2;
  set local role authenticated;
  r := public.join_league(lower(left(code, 5)) || '-' || lower(right(code, 5)));
  if (r -> 'league' ->> 'id')::uuid is distinct from lid or (r ->> 'already_member')::boolean then
    raise exception 'FAIL: Join mit gültigem Code: %', r;
  end if;
  select count(*) into n from public.players; if n <> 4 then raise exception 'FAIL: Mitglied sieht % Spieler', n; end if;

  -- Claim: eigenen Claim setzen ok, fremde auth.uid() verboten
  update public.players set claimed_by = u2 where id = p1;
  begin
    update public.players set claimed_by = u1 where id = p2;
    raise exception 'FAIL: fremder Claim möglich';
  exception when others then
    if sqlerrm not like '%claimed_by%' then raise; end if;
  end;

  -- created_by-Spoofing beim Match-Insert verboten
  begin
    insert into public.matches (league_id, a1, a1_pos, a2, a2_pos, b1, b1_pos, b2, b2_pos, score_a, score_b, winner, created_by)
    values (lid, p1, 'atk', p2, 'def', p3, 'atk', p4, 'def', 10, 1, 'A', u1);
    raise exception 'FAIL: created_by-Spoofing möglich';
  exception when sqlstate '42501' then null;
  end;

  -- Cross-League-Match: Spieler aus fremder Liga → Trigger blockt
  r := public.create_league('Zweite Liga');
  lid2 := (r -> 'league' ->> 'id')::uuid;
  insert into public.players (league_id, name) values (lid2, 'E') returning id into q1;
  insert into public.players (league_id, name) values (lid2, 'F') returning id into q2;
  insert into public.players (league_id, name) values (lid2, 'G') returning id into q3;
  insert into public.players (league_id, name) values (lid2, 'H') returning id into q4;
  begin
    insert into public.matches (league_id, a1, a1_pos, a2, a2_pos, b1, b1_pos, b2, b2_pos, score_a, score_b, winner)
    values (lid2, p1, 'atk', q2, 'def', q3, 'atk', q4, 'def', 10, 5, 'A');
    raise exception 'FAIL: Cross-League-Match möglich';
  exception when others then
    if sqlerrm not like '%Liga des Matches%' then raise; end if;
  end;

  -- Owner mit Mitgliedern kann nicht einfach gehen
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  begin
    perform public.leave_league(lid);
    raise exception 'FAIL: Owner konnte Liga mit Mitgliedern verlassen';
  exception when others then
    if sqlerrm <> 'owner_must_transfer_or_close' then raise; end if;
  end;

  -- Match-Edit durch Mitglied: erlaubt, auditiert, bumpt rev
  update public.matches set score_b = 7 where id = mid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: Mitglied konnte Match nicht editieren'; end if;
  -- Hartes DELETE bleibt auch für Mitglieder wirkungslos
  delete from public.matches where id = mid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: hartes Match-DELETE möglich'; end if;

  reset role;
  select count(*) into n from public.audit_log where league_id = lid and entity = 'matches';
  if n < 1 then raise exception 'FAIL: Match-Edit nicht auditiert'; end if;
  select rev into n from public.leagues where id = lid;
  if n <> 1 then raise exception 'FAIL: rev nicht gebumpt (rev=%)', n; end if;

  -- ═══ PHASE 2: close_league · transfer_ownership · Kick-Hygiene ═══

  -- Mitglied (u2): weder schließen noch übertragen noch deleted_at setzen
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.close_league(lid);
    raise exception 'FAIL: Mitglied konnte Liga schließen';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  begin
    perform public.transfer_ownership(lid, u2);
    raise exception 'FAIL: Mitglied konnte Ownership übertragen';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  update public.leagues set deleted_at = now() where id = lid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Mitglied konnte deleted_at setzen'; end if;

  -- Owner (u1) befördert u2 zu Admin (direktes Update, Policy-gedeckt)
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  update public.league_members set role = 'admin' where league_id = lid and user_id = u2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: Owner konnte Rolle nicht ändern'; end if;

  -- Admin (u2) darf trotz UPDATE-Policy NICHT schließen (leagues_guard)
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  begin
    update public.leagues set deleted_at = now() where id = lid;
    raise exception 'FAIL: Admin konnte Liga per Direkt-Update schließen';
  exception when others then
    if sqlerrm not like '%Owner%' then raise; end if;
  end;

  -- Transfer: u1 (Owner) → u2; danach ist u1 Admin
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform public.transfer_ownership(lid, u2);
  reset role;
  select count(*) into n from public.league_members
    where league_id = lid and user_id = u2 and role = 'owner';
  if n <> 1 then raise exception 'FAIL: Transfer hat u2 nicht zum Owner gemacht'; end if;
  select count(*) into n from public.league_members
    where league_id = lid and user_id = u1 and role = 'admin';
  if n <> 1 then raise exception 'FAIL: Transfer hat u1 nicht zum Admin gemacht'; end if;

  -- Kick löst Claims: u1 claimt Spieler B, u2 (Owner) kickt u1 → Claim frei
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.players set claimed_by = u1 where id = p2;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  delete from public.league_members where league_id = lid and user_id = u1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: Owner konnte Admin nicht kicken'; end if;
  reset role;
  select count(*) into n from public.players where id = p2 and claimed_by is not null;
  if n <> 0 then raise exception 'FAIL: Kick hat Claim nicht freigegeben'; end if;
  select count(*) into n from public.players where id = p1 and claimed_by = u2;
  if n <> 1 then raise exception 'FAIL: fremder Claim wurde fälschlich freigegeben'; end if;

  -- Owner (u2, jetzt letztes Mitglied) schließt die Liga
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.close_league(lid);
  reset role;
  select count(*) into n from public.leagues
    where id = lid and deleted_at is not null and join_enabled = false;
  if n <> 1 then raise exception 'FAIL: close_league hat nicht geschlossen'; end if;
  select count(*) into n from public.league_invites where league_id = lid and revoked_at is null;
  if n <> 0 then raise exception 'FAIL: close_league hat Invites nicht revoked'; end if;

  raise notice 'ALLE RLS-NEGATIVTESTS BESTANDEN (Phase 1 + 2)';
end;
$$;

rollback;

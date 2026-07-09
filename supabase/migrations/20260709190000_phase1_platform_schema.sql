-- PHASE 1 — Plattform-Schema (Multi-Liga).
-- Die Liga ist das zentrale Objekt: Spieler/Matches/Saisons/Stories gehören
-- einer Liga, nie einem Login. Nutzer (auch anonyme) sind nur über
-- league_members mit Ligen verbunden. Plan: docs/KICKER_LEAGUES_PLAN.md §4.
--
-- Abweichung vom Plan (bewusst): stories behält seine Spalte `id` als
-- deterministischen Story-Key (PK wird (league_id, id)) statt einer
-- Umbenennung in story_key — das hält den Client-Diff minimal, die
-- Dedupe-Semantik ist identisch.

create extension if not exists pgcrypto with schema extensions;

-- ── Plattform-Tabellen ──────────────────────────────────────────────────

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_by uuid references auth.users (id) on delete set null,
  -- 18 Elo-Parameter + startElo/monthlyReset als JSONB; der Client merged
  -- gespeicherte Werte über Code-Defaults (heutiges cfg_overrides-Muster)
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  join_enabled boolean not null default true,
  -- Bump bei Match-Edit/Soft-Delete → Cache-Invalidierung (Full-Resync)
  rev bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index league_members_user_idx on public.league_members (user_id);

create table public.league_invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  code text not null unique,          -- 10 Zeichen Crockford-Base32 ≈ 50 Bit
  created_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  expires_at timestamptz,
  use_count integer not null default 0,
  created_at timestamptz not null default now()
);
-- pro Liga genau ein aktiver Code
create unique index league_invites_one_active
  on public.league_invites (league_id) where revoked_at is null;

-- Rate-Limit-Puffer für join_league (nur via RPC beschrieben/gelesen)
create table public.join_attempts (
  user_id uuid not null,
  attempted_at timestamptz not null default now(),
  code_prefix text
);
create index join_attempts_user_idx on public.join_attempts (user_id, attempted_at);

create table public.audit_log (
  id bigint generated always as identity primary key,
  league_id uuid not null references public.leagues (id) on delete cascade,
  actor uuid,
  action text not null,               -- 'update' | 'delete' | …
  entity text not null,               -- Tabellenname
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_league_idx on public.audit_log (league_id, created_at desc);

-- Source of Truth für Premium. Schreiben AUSSCHLIESSLICH Service-Role
-- (Payment-Webhook / manueller Grant) — keine Client-Policies.
create table public.league_entitlements (
  league_id uuid primary key references public.leagues (id) on delete cascade,
  tier text not null default 'premium',
  source text not null check (source in ('stripe', 'app_store', 'play', 'grant')),
  external_ref text,
  raw jsonb not null default '{}'::jsonb,
  purchased_at timestamptz not null default now()
);

-- ── Bestehende Tabellen liga-fähig machen (alle Tabellen sind leer) ─────

alter table public.players
  add column league_id uuid not null references public.leagues (id) on delete cascade,
  add column claimed_by uuid references auth.users (id) on delete set null,
  add column deleted_at timestamptz;
alter table public.players drop constraint players_name_key;
-- Name eindeutig pro Liga; Soft-gelöschte geben den Namen wieder frei
create unique index players_league_name_key
  on public.players (league_id, name) where deleted_at is null;
create index players_league_idx on public.players (league_id);

alter table public.matches
  add column league_id uuid not null references public.leagues (id) on delete cascade,
  -- default auth.uid(): der Insert-Pfad der App muss created_by nicht kennen
  add column created_by uuid default auth.uid(),
  add column deleted_at timestamptz,
  add column updated_at timestamptz;
-- DER heiße Index: jede Datenlast ist "Matches einer Liga, chronologisch"
create index matches_league_created_idx
  on public.matches (league_id, created_at) where deleted_at is null;

alter table public.seasons
  add column league_id uuid not null references public.leagues (id) on delete cascade;
alter table public.seasons drop constraint seasons_pkey;
alter table public.seasons add primary key (league_id, id);

alter table public.stories
  add column league_id uuid not null references public.leagues (id) on delete cascade;
alter table public.stories drop constraint stories_pkey;
alter table public.stories add primary key (league_id, id);
create index stories_league_event_idx on public.stories (league_id, event_at desc);

-- Die globale config-Tabelle entfällt: die Elo-Parameter leben pro Liga
-- in leagues.settings
drop table public.config;

-- ── RLS + Realtime ──────────────────────────────────────────────────────

alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.league_invites enable row level security;
alter table public.join_attempts enable row level security;   -- keine Policies: nur RPC
alter table public.audit_log enable row level security;
alter table public.league_entitlements enable row level security;

-- Per-Liga-Realtime ab Phase 1: stories UND matches (Plan §8);
-- stories ist ggf. schon in der Publication (Phase 0)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'stories'
  ) then
    alter publication supabase_realtime add table public.stories;
  end if;
end $$;

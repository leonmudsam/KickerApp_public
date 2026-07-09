-- PHASE 0 BASELINE: das Ist-Schema der Single-Tenant-App als Migration,
-- damit frische Datenbanken (lokale Entwicklung via `supabase start`,
-- Preview-Branches) komplett aus dem Repo aufgebaut werden können.
-- Auf dem Produktionsprojekt ffpvdqebpbzdyaisovnm existieren die Tabellen
-- bereits (per Dashboard angelegt) → IF NOT EXISTS macht alles zum No-Op.
-- Wird in PHASE 1 durch das Multi-Liga-Schema erweitert/umgebaut.

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  elo real not null default 1000,
  atk real not null default 0.5,
  created_at timestamptz not null default now(),
  hidden boolean default false,
  avatar_id text
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  a1 uuid not null references public.players(id),
  a1_pos text not null check (a1_pos in ('atk','def')),
  a2 uuid not null references public.players(id),
  a2_pos text not null check (a2_pos in ('atk','def')),
  b1 uuid not null references public.players(id),
  b1_pos text not null check (b1_pos in ('atk','def')),
  b2 uuid not null references public.players(id),
  b2_pos text not null check (b2_pos in ('atk','def')),
  score_a integer not null default 0,
  score_b integer not null default 0,
  winner text not null check (winner in ('A','B')),
  deltas jsonb not null default '{}'::jsonb,
  exp_a real not null default 0.5,
  created_at timestamptz not null default now()
);

create table if not exists public.seasons (
  id text primary key,
  label text not null,
  start_date date not null,
  end_date date not null,
  player_id uuid references public.players(id),
  team_p1 uuid references public.players(id),
  team_p2 uuid references public.players(id),
  top_elo jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.stories (
  id text primary key,
  type text not null,
  category text not null,
  icon text,
  title text not null,
  description text not null,
  data_ref jsonb not null default '{}'::jsonb,
  priority integer not null default 5,
  event_at timestamptz not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create table if not exists public.config (
  id integer primary key default 1 check (id = 1),
  k_factor real not null default 32,
  risk_split real not null default 0.6,
  pos_swing real not null default 0.45,
  start_elo real not null default 1000,
  win_boost real not null default 1.10,
  mov_loss_damp real not null default 0.5,
  match_bonus real not null default 1.5,
  pos_min_games integer default 3,
  exp_weight double precision default 0.5,
  new_player_mult double precision default 1.5,
  new_player_mid_mult double precision default 1.2,
  veteran_damp double precision default 0.85,
  mov_max_boost double precision default 0.4,
  exp_protect_max double precision default 0.1,
  underdog_elo_max double precision default 0.15,
  underdog_games_max double precision default 0.05,
  low_elo_loss_damp double precision default 0
);

alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.seasons enable row level security;
alter table public.stories enable row level security;
alter table public.config enable row level security;

-- ============================================================
-- BarTV prototype — initial schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ── 1. Tables ────────────────────────────────────────────────

create table if not exists public.tvs (
  id              text        primary key,           -- 'A' | 'B' | 'C'
  name            text        not null,
  locked          boolean     not null default false,
  current_game    text,                              -- null = idle
  current_ends_at timestamptz                        -- null = idle
);

create table if not exists public.requests (
  id          uuid        primary key default gen_random_uuid(),
  tv_id       text        not null references public.tvs(id) on delete cascade,
  game        text        not null,
  priority    text        not null check (priority in ('free', 'boost', 'next')),
  created_at  timestamptz not null default now()
);

-- ── 2. Row-level security ─────────────────────────────────────
-- Disabled for this prototype — no auth, anon key has full access.
-- Re-enable and add policies before going to production.

alter table public.tvs     disable row level security;
alter table public.requests disable row level security;

-- ── 3. Realtime ───────────────────────────────────────────────
-- Adds both tables to the supabase_realtime publication so that
-- postgres_changes subscriptions fire on INSERT / UPDATE / DELETE.

do $$
begin
  -- tvs
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tvs'
  ) then
    alter publication supabase_realtime add table public.tvs;
  end if;

  -- requests
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'requests'
  ) then
    alter publication supabase_realtime add table public.requests;
  end if;
end $$;

-- ── 4. Seed data ──────────────────────────────────────────────
-- Idempotent: on conflict do nothing, so re-running is safe.

insert into public.tvs (id, name, locked, current_game, current_ends_at)
values
  ('A', 'TV A', false, 'NFL · Broncos vs. Chiefs',           now() + interval '20 seconds'),
  ('B', 'TV B', false, 'NHL · Avalanche vs. Golden Knights', now() + interval '20 seconds'),
  ('C', 'TV C', false, null, null)
on conflict (id) do nothing;

-- Stable UUIDs make this idempotent: re-running the migration hits
-- ON CONFLICT (id) DO NOTHING instead of appending duplicate rows.
-- These same IDs are used by resetAllTVs() in lib/db.ts.
insert into public.requests (id, tv_id, game, priority)
values
  ('11111111-1111-1111-1111-000000000001', 'A', 'NBA · Warriors vs. Celtics', 'next'),
  ('11111111-1111-1111-1111-000000000002', 'A', 'UFC 310 · Main Card',        'free'),
  ('11111111-1111-1111-1111-000000000003', 'B', 'F1 · Abu Dhabi Grand Prix',  'boost')
on conflict (id) do nothing;

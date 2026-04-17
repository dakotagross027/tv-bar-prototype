-- ============================================================
-- BarTV prototype — 002: deduplicate requests + stable seed IDs
--
-- WHY THIS IS NEEDED
-- The original 001_initial_schema.sql seed INSERT had no ON CONFLICT
-- clause.  Each time the migration was re-run it appended three more
-- seed rows (the requests table has no natural unique key because the
-- same game can legitimately be requested by different customers).
-- This migration removes the accumulated duplicates and replaces any
-- auto-UUID seed rows with stable, well-known UUIDs so that future
-- runs of resetAllTVs() and the migration are idempotent.
--
-- HOW TO RUN
-- Supabase Dashboard → SQL Editor → New query → paste → Run
-- Safe to run multiple times (all statements are idempotent).
-- ============================================================

-- ── 1. Remove duplicate seed requests ────────────────────────
-- Keep only the earliest row for each (tv_id, game, priority) group.
-- Rows submitted by real customers are unaffected as long as they have
-- a unique (tv_id, game, priority) combination.
delete from public.requests
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by tv_id, game, priority
        order by created_at asc, id asc   -- oldest first → keep rn = 1
      ) as rn
    from public.requests
  ) ranked
  where rn > 1
);

-- ── 2. Normalise seed rows to stable UUIDs ───────────────────
-- After the dedup above there will be at most one row per seed combo,
-- but it may have an auto-generated UUID.  Replace it with the
-- canonical stable UUID so future resets are idempotent.

-- Remove any seed rows that still have auto-generated UUIDs
delete from public.requests
where
  (tv_id = 'A' and game = 'NBA · Warriors vs. Celtics' and priority = 'next'
   and id <> '11111111-1111-1111-1111-000000000001')
  or
  (tv_id = 'A' and game = 'UFC 310 · Main Card' and priority = 'free'
   and id <> '11111111-1111-1111-1111-000000000002')
  or
  (tv_id = 'B' and game = 'F1 · Abu Dhabi Grand Prix' and priority = 'boost'
   and id <> '11111111-1111-1111-1111-000000000003');

-- Re-insert with stable UUIDs (skipped if the stable row already exists)
insert into public.requests (id, tv_id, game, priority)
values
  ('11111111-1111-1111-1111-000000000001', 'A', 'NBA · Warriors vs. Celtics', 'next'),
  ('11111111-1111-1111-1111-000000000002', 'A', 'UFC 310 · Main Card',        'free'),
  ('11111111-1111-1111-1111-000000000003', 'B', 'F1 · Abu Dhabi Grand Prix',  'boost')
on conflict (id) do nothing;

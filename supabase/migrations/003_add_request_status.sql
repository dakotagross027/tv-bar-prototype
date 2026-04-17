-- ============================================================
-- BarTV prototype — 003: request lifecycle status
--
-- Adds a `status` column to `requests` that makes each
-- request's lifecycle explicit:
--
--   queued  → waiting in the queue for this TV
--   active  → currently playing on the TV right now
--   done    → has been played through (or manually advanced past)
--
-- Before this migration the app deleted rows on advance, so
-- history was lost and "what is playing" was a loose string on
-- the tvs row with no link back to the originating request.
--
-- After this migration:
--   • tvs.current_game mirrors the `active` request's game (fast reads)
--   • loadTVs only fetches status='queued' rows for the queue display
--   • advanceTVInDB transitions statuses instead of deleting rows
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → Run
--   Safe to re-run — uses IF NOT EXISTS / idempotent guards.
-- ============================================================

-- ── 1. Add status column ──────────────────────────────────────
-- Existing rows default to 'queued', which is correct — they were
-- all waiting in the queue before this migration ran.
alter table public.requests
  add column if not exists status text not null default 'queued'
    check (status in ('queued', 'active', 'done'));

-- ── 2. Indexes ────────────────────────────────────────────────
-- advanceTVInDB:  WHERE tv_id = X AND status = 'queued'  (find next)
-- advanceTVInDB:  WHERE tv_id = X AND status = 'active'  (complete current)
-- loadTVs:        WHERE status = 'queued'                 (queue display)
create index if not exists requests_tv_status_idx
  on public.requests(tv_id, status);

-- ── 3. Update the stable seed rows ───────────────────────────
-- Seed rows inserted before this migration exist with status
-- defaulted to 'queued' — this is already correct, but make
-- explicit so future re-runs of 001 or resetAllTVs() are clean.
update public.requests
  set status = 'queued'
  where id in (
    '11111111-1111-1111-1111-000000000001',
    '11111111-1111-1111-1111-000000000002',
    '11111111-1111-1111-1111-000000000003'
  );

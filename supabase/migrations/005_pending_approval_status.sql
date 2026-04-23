-- Migration 005: clean up queue-eligibility semantics
--
-- Problem: after migration 004, a newly submitted request has
--   status = 'queued'  AND  request_status = 'pending'
-- which means status = 'queued' no longer unambiguously means
-- "confirmed and waiting in the TV queue".  Every query that wants
-- queue-eligible rows must carry a compound filter, and a query
-- that forgets request_status = 'confirmed' silently shows pending
-- requests in the queue.
--
-- Fix: add 'pending_approval' as a first-class status value.
-- A submitted-but-unconfirmed request now lives at
--   status = 'pending_approval'
-- and only moves to status = 'queued' when the bartender confirms it.
-- status = 'queued' is now unambiguous — it always means confirmed.
--
-- Full lifecycle after this migration:
--
--   pending_approval  submitted, awaiting bartender decision
--        │
--        ├─[confirm]─→ queued    confirmed, waiting in TV queue
--        │                │
--        │                └─[advance]─→ active → done
--        │
--        └─[decline]─→ done      rejected, never touched the queue
--
-- No application data is lost.  request_status = 'confirmed | declined'
-- is kept as the authoritative approval record (and for customer polling).

-- ── 1. Extend the check constraint ────────────────────────────────────────────
-- Drop the existing constraint by name first (idempotent when re-run because
-- the new constraint replaces it).  Supabase auto-names check constraints as
-- <table>_<column>_check — adjust if yours differs.
alter table public.requests
  drop constraint if exists requests_status_check;

alter table public.requests
  add constraint requests_status_check
    check (status in ('pending_approval', 'queued', 'active', 'done'));

-- ── 2. Move pending rows out of 'queued' ──────────────────────────────────────
-- Any row that is status='queued' but still awaiting bartender confirmation
-- was created under the old model.  Move it to 'pending_approval'.
update public.requests
  set status = 'pending_approval'
  where status = 'queued'
    and request_status = 'pending';

-- ── 3. Update index comment (existing index still covers the new value) ───────
-- requests_tv_status_idx on (tv_id, status) already exists from migration 003.
-- It covers the new 'pending_approval' value automatically.
-- requests_request_status_idx on (request_status) exists from migration 004.

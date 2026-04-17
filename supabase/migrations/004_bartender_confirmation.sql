-- Migration 004: bartender confirmation workflow
-- Adds request_status (pending/confirmed/declined) and payment_status columns.

alter table public.requests
  add column if not exists request_status text not null default 'pending'
    check (request_status in ('pending', 'confirmed', 'declined'));

alter table public.requests
  add column if not exists payment_status text not null default 'awaiting_confirmation'
    check (payment_status in ('awaiting_confirmation', 'charged', 'not_charged'));

-- Backfill: all pre-existing rows were submitted before the confirmation workflow
-- existed, so treat them as already confirmed (and paid if non-free).
update public.requests
  set
    request_status = 'confirmed',
    payment_status = case
      when priority = 'free' then 'not_charged'
      else 'charged'
    end
  where request_status = 'pending';

create index if not exists requests_request_status_idx on public.requests(request_status);

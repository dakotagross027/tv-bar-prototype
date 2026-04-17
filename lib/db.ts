import { supabase } from "./supabase";
import {
  type PaymentStatus,
  type PendingRequest,
  type Priority,
  type RequestItem,
  type RequestStatus,
  type TV,
  SLOT_SECONDS,
  sortQueue,
} from "../app/prototype";

// ─── DB row shapes ────────────────────────────────────────────────────────────

type TVRow = {
  id: string;
  name: string;
  locked: boolean;
  current_game: string | null;
  current_ends_at: string | null;
};

type RequestRow = {
  id: string;
  tv_id: string;
  game: string;
  priority: Priority;
  created_at: string;
  status: "queued" | "active" | "done";
  request_status: RequestStatus;
  payment_status: PaymentStatus;
};

// ─── Error helper ─────────────────────────────────────────────────────────────

/**
 * Converts a Supabase PostgrestError (or anything) into a plain JS Error so
 * callers always get `err.message` as a readable string rather than [object Object].
 */
function toError(raw: unknown, context: string): Error {
  if (raw instanceof Error) return raw;
  // PostgrestError has { message, details, hint, code }
  if (raw && typeof raw === "object" && "message" in raw) {
    const pg = raw as { message: string; details?: string; hint?: string };
    const detail = [pg.details, pg.hint].filter(Boolean).join(" — ");
    return new Error(`[${context}] ${pg.message}${detail ? `: ${detail}` : ""}`);
  }
  return new Error(`[${context}] ${String(raw)}`);
}

// ─── Mapping helpers ──────────────────────────────────────────────────────────

function rowsToTVs(tvRows: TVRow[], reqRows: RequestRow[]): TV[] {
  return tvRows.map((row) => {
    // reqRows has already been pre-filtered to status='queued' by loadTVs
    const queue: RequestItem[] = reqRows
      .filter((r) => r.tv_id === row.id)
      .map((r) => ({
        id: r.id,
        game: r.game,
        priority: r.priority,
        createdAt: new Date(r.created_at).getTime(),
      }));

    return {
      id: row.id,
      name: row.name,
      locked: row.locked,
      currentGame: row.current_game,
      currentEndsAt: row.current_ends_at
        ? new Date(row.current_ends_at).getTime()
        : null,
      queue,
    };
  });
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function loadTVs(): Promise<TV[]> {
  const [{ data: tvRows, error: tvErr }, { data: reqRows, error: reqErr }] =
    await Promise.all([
      supabase.from("tvs").select("*").order("id"),
      supabase
        .from("requests")
        .select("*")
        .eq("status", "queued")
        .eq("request_status", "confirmed")
        .order("created_at"),
    ]);

  if (tvErr) throw toError(tvErr, "loadTVs/tvs");
  if (reqErr) throw toError(reqErr, "loadTVs/requests");

  return rowsToTVs((tvRows ?? []) as TVRow[], (reqRows ?? []) as RequestRow[]);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Advance a TV to the next queued request, or clear it to idle when the queue
 * is empty.
 *
 * ── Timer path  (force = false, the default) ─────────────────────────────────
 * Uses a single atomic  UPDATE … WHERE current_ends_at ≤ now() RETURNING id
 * rather than a two-step SELECT + UPDATE.  The RETURNING id lets us count how
 * many rows were actually changed:
 *   • 1 row  → we claimed the advance, proceed to status transitions
 *   • 0 rows → slot not yet expired OR already claimed by another tab/device;
 *              bail silently — the next timer tick will retry if still needed
 *
 * This eliminates the TOCTOU race: the "check" and "write" are one SQL statement.
 *
 * ── Staff / idle path  (force = true) ────────────────────────────────────────
 * No expiry filter — always advances regardless of the countdown.  Used by the
 * dashboard Advance button and by addRequest() when a TV is idle.
 *
 * ── Status lifecycle ─────────────────────────────────────────────────────────
 * Instead of deleting the promoted request, we transition statuses:
 *   queued → active  (the new "now playing" request)
 *   active → done    (the previous "now playing" request)
 * tvs.current_game remains as the fast-read mirror; status transitions are the
 * authoritative record for history and queue membership.
 */
export async function advanceTVInDB(
  tvId: string,
  { force = false } = {}
): Promise<void> {
  // ── 1. Fetch queued requests for this TV ─────────────────────────────────
  const { data: reqRows, error: reqErr } = await supabase
    .from("requests")
    .select("*")
    .eq("tv_id", tvId)
    .eq("status", "queued")
    .eq("request_status", "confirmed")
    .order("created_at");

  if (reqErr) throw toError(reqErr, "advanceTVInDB/fetch");

  const requests = (reqRows ?? []) as RequestRow[];

  // ── 2. Determine the next state ───────────────────────────────────────────
  // Sort by priority (next > boost > free) then FIFO within each tier.
  // This is the canonical ordering — identical to what the UI shows as "Up Next".
  let nextGame: string | null = null;
  let nextRequestId: string | null = null;

  if (requests.length > 0) {
    const sorted = sortQueue(
      requests.map((r) => ({
        id: r.id,
        game: r.game,
        priority: r.priority,
        createdAt: new Date(r.created_at).getTime(),
      }))
    );
    nextGame = sorted[0].game;
    nextRequestId = sorted[0].id;
    console.log(
      `[BarTV] advanceTVInDB ${tvId}: next="${nextGame}" (${sorted[0].priority})`
    );
  } else {
    console.log(`[BarTV] advanceTVInDB ${tvId}: queue empty — clearing to idle`);
  }

  const tvPayload = nextGame !== null
    ? {
        current_game: nextGame,
        current_ends_at: new Date(Date.now() + SLOT_SECONDS * 1000).toISOString(),
      }
    : { current_game: null as null, current_ends_at: null as null };

  // ── 3. Atomically update the TV row ──────────────────────────────────────
  // .select("id") adds  Prefer: return=representation  so PostgREST returns
  // the updated rows.  Empty array → 0 rows matched the WHERE clause.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseQuery = supabase.from("tvs").update(tvPayload).eq("id", tvId) as any;
  const { data: updated, error: tvErr } = await (
    force
      ? baseQuery.select("id")
      : baseQuery.lte("current_ends_at", new Date().toISOString()).select("id")
  );

  if (tvErr) throw toError(tvErr, "advanceTVInDB/update");

  const rowCount = Array.isArray(updated) ? updated.length : 0;

  if (rowCount === 0) {
    if (force) {
      // Staff force-advance matched 0 rows — the TV record is missing or the
      // DB rejected the write.  Surface this as an error so it shows in the UI.
      throw new Error(
        `advanceTVInDB: UPDATE matched 0 rows for TV "${tvId}". ` +
        `Check that the TV exists in Supabase and that the anon key has UPDATE permission on public.tvs.`
      );
    }
    // Timer path: slot not yet expired or already advanced by another client.
    console.log(`[BarTV] advanceTVInDB ${tvId}: 0 rows updated — skipping`);
    return;
  }

  // ── 4. Transition request statuses ───────────────────────────────────────
  // The TV update has already committed — errors below are logged but don't
  // roll it back.  Mark the previously-active request as done first, then
  // promote the new request to active.

  // Mark the current active request (if any) as done.
  // An UPDATE that matches 0 rows is not a DB error, so this is safe even
  // when there is no active row (e.g. first advance after a direct DB seed).
  const { error: doneErr } = await supabase
    .from("requests")
    .update({ status: "done" })
    .eq("tv_id", tvId)
    .eq("status", "active");
  if (doneErr) {
    // Log but don't throw — the TV row is already updated; partial history
    // loss is preferable to a thrown error that hides the successful advance.
    console.error(
      `[BarTV] advanceTVInDB ${tvId}: failed to mark active request as done:`,
      doneErr.message
    );
  }

  // Mark the promoted request as active so it can be transitioned to done
  // on the next advance, and so it is excluded from the queued display.
  if (nextRequestId !== null) {
    const { error: activateErr } = await supabase
      .from("requests")
      .update({ status: "active" })
      .eq("id", nextRequestId);
    if (activateErr) throw toError(activateErr, "advanceTVInDB/activate");
  }

  console.log(
    `[BarTV] advanceTVInDB ${tvId}: ✓ now playing "${nextGame ?? "idle"}"`
  );
}

/**
 * Add a new guest request. The request starts in "pending" state awaiting
 * bartender confirmation. Returns the new request's ID so the customer page
 * can track its confirmation status.
 */
export async function addRequest(
  tvId: string,
  game: string,
  priority: Priority
): Promise<string> {
  const { data, error: insertErr } = await supabase
    .from("requests")
    .insert({
      tv_id: tvId,
      game,
      priority,
      status: "queued",
      request_status: "pending",
      payment_status: "awaiting_confirmation",
    })
    .select("id")
    .single();

  if (insertErr) throw toError(insertErr, "addRequest/insert");
  return (data as { id: string }).id;
}

/**
 * Bartender confirms a pending request. Marks it as confirmed (and charged if
 * non-free), then auto-advances the TV if it is currently idle so the game
 * starts playing immediately.
 */
export async function confirmRequest(id: string): Promise<void> {
  // Fetch the request to know tvId and priority (needed for payment status)
  const { data: req, error: reqErr } = await supabase
    .from("requests")
    .select("tv_id, priority")
    .eq("id", id)
    .single();
  if (reqErr) throw toError(reqErr, "confirmRequest/fetch");

  const { tv_id: tvId, priority } = req as { tv_id: string; priority: Priority };
  const paymentStatus: PaymentStatus = priority === "free" ? "not_charged" : "charged";

  const { error: updateErr } = await supabase
    .from("requests")
    .update({ request_status: "confirmed", payment_status: paymentStatus })
    .eq("id", id);
  if (updateErr) throw toError(updateErr, "confirmRequest/update");

  // Auto-advance idle TV so the confirmed request starts playing right away
  const { data: tv, error: tvErr } = await supabase
    .from("tvs")
    .select("current_game")
    .eq("id", tvId)
    .single();
  if (tvErr && (tvErr as { code?: string }).code !== "PGRST116") {
    throw toError(tvErr, "confirmRequest/checkTV");
  }
  if (tv && !tv.current_game) {
    await advanceTVInDB(tvId, { force: true });
  }
}

/**
 * Bartender declines a pending request. Marks it as declined and not_charged,
 * and transitions status to "done" so it never enters the queue.
 */
export async function declineRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from("requests")
    .update({ request_status: "declined", payment_status: "not_charged", status: "done" })
    .eq("id", id);
  if (error) throw toError(error, "declineRequest");
}

/**
 * Load all pending (unconfirmed) requests across all TVs, for the dashboard.
 */
export async function loadPendingRequests(): Promise<PendingRequest[]> {
  const [{ data: tvRows, error: tvErr }, { data: reqRows, error: reqErr }] =
    await Promise.all([
      supabase.from("tvs").select("id, name"),
      supabase
        .from("requests")
        .select("*")
        .eq("request_status", "pending")
        .neq("status", "done")
        .order("created_at"),
    ]);

  if (tvErr) throw toError(tvErr, "loadPendingRequests/tvs");
  if (reqErr) throw toError(reqErr, "loadPendingRequests/requests");

  const tvMap = new Map((tvRows ?? []).map((t) => [t.id, t.name]));

  return ((reqRows ?? []) as RequestRow[]).map((r) => ({
    id: r.id,
    tvId: r.tv_id,
    tvName: tvMap.get(r.tv_id) ?? r.tv_id,
    game: r.game,
    priority: r.priority,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

/**
 * Fetch the request_status of a single request — used by the customer page to
 * poll for bartender confirmation.
 */
export async function loadRequestStatus(id: string): Promise<RequestStatus> {
  const { data, error } = await supabase
    .from("requests")
    .select("request_status")
    .eq("id", id)
    .single();
  if (error) throw toError(error, "loadRequestStatus");
  return (data as { request_status: RequestStatus }).request_status;
}

export async function toggleLockInDB(
  tvId: string,
  locked: boolean
): Promise<void> {
  const { error } = await supabase
    .from("tvs")
    .update({ locked })
    .eq("id", tvId);
  if (error) throw toError(error, "toggleLockInDB");
}

// ─── Seed constants ───────────────────────────────────────────────────────────

// Stable, well-known UUIDs for the three demo seed requests.
// Fixed IDs are the key to idempotency: both resetAllTVs() and the SQL
// migration use ON CONFLICT (id) DO UPDATE / DO NOTHING so re-running
// either never appends duplicate rows.
const SEED_ID_A_WARRIORS = "11111111-1111-1111-1111-000000000001";
const SEED_ID_A_UFC      = "11111111-1111-1111-1111-000000000002";
const SEED_ID_B_F1       = "11111111-1111-1111-1111-000000000003";

/**
 * Reset all TVs and requests back to the seeded demo state.
 *
 * Design goals:
 *  • Wipe every existing request (including accumulated duplicates)
 *  • Restore the three TVs to their demo starting positions
 *  • Re-seed exactly three demo requests using stable UUIDs
 *
 * Idempotency guarantee:
 *  The seed upsert targets fixed UUIDs, so calling this function from two
 *  browser tabs simultaneously produces exactly three rows — the second
 *  concurrent upsert hits ON CONFLICT and is a no-op.
 */
export async function resetAllTVs(): Promise<void> {
  const endsAt = new Date(Date.now() + SLOT_SECONDS * 1000).toISOString();

  // ── 1. Delete ALL requests ─────────────────────────────────────────────────
  // `.not("id", "is", null)` is semantically "WHERE id IS NOT NULL", which
  // matches every row (id is a NOT NULL primary key).  This is more reliable
  // than `.neq("tv_id", "")` — that filter could miss rows with unexpected
  // tv_id values and silently leave orphans that then accumulate on each reset.
  const { error: delErr } = await supabase
    .from("requests")
    .delete()
    .not("id", "is", null);
  if (delErr) throw toError(delErr, "resetAllTVs/deleteRequests");

  // ── 2. Restore TV rows ────────────────────────────────────────────────────
  const { error: upsertErr } = await supabase.from("tvs").upsert([
    { id: "A", name: "TV A", locked: false, current_game: "NFL · Broncos vs. Chiefs",           current_ends_at: endsAt },
    { id: "B", name: "TV B", locked: false, current_game: "NHL · Avalanche vs. Golden Knights", current_ends_at: endsAt },
    { id: "C", name: "TV C", locked: false, current_game: null,                                 current_ends_at: null   },
  ]);
  if (upsertErr) throw toError(upsertErr, "resetAllTVs/upsert");

  // ── 3. Re-seed with stable UUIDs ─────────────────────────────────────────
  // upsert (not insert) so that concurrent resets from two open tabs are safe:
  // the second call hits ON CONFLICT on the UUID primary key and is a no-op
  // rather than inserting a second copy of each seed row.
  // Explicit status: "queued" ensures the rows appear in the queue display
  // even if migration 003 has not yet run (column defaults handle that case too).
  const { error: seedErr } = await supabase.from("requests").upsert(
    [
      { id: SEED_ID_A_WARRIORS, tv_id: "A", game: "NBA · Warriors vs. Celtics", priority: "next",  status: "queued", request_status: "confirmed", payment_status: "charged"     },
      { id: SEED_ID_A_UFC,      tv_id: "A", game: "UFC 310 · Main Card",        priority: "free",  status: "queued", request_status: "confirmed", payment_status: "not_charged" },
      { id: SEED_ID_B_F1,       tv_id: "B", game: "F1 · Abu Dhabi Grand Prix",  priority: "boost", status: "queued", request_status: "confirmed", payment_status: "charged"     },
    ],
    { onConflict: "id" }
  );
  if (seedErr) throw toError(seedErr, "resetAllTVs/seed");
}

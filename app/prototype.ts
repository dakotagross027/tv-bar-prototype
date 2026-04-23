export type Priority = "free" | "boost" | "next";

// ─── Request status types ─────────────────────────────────────────────────────
//
// A request carries three orthogonal fields.  Each answers a different question:
//
//  QueueStatus   — WHERE is this request in the TV queue lifecycle?
//  RequestStatus — WHAT did the bartender decide?
//  PaymentStatus — WAS the guest charged?
//
// Queue-eligibility rule:
//   status = 'queued' AND request_status = 'confirmed'
//
//   Both conditions are required.  A newly submitted request has
//   status='queued' but request_status='pending', which keeps it invisible
//   to advanceTVInDB and the queue display until the bartender confirms it.
//
// Full lifecycle:
//
//   [submit] ──▶ status=queued / request_status=pending   (awaiting bartender)
//       │
//       ├─[confirm]──▶ status=queued / request_status=confirmed   (in queue)
//       │                  │
//       │              [advance]──▶ status=active ──[advance]──▶ status=done
//       │
//       └─[decline]──▶ status=done / request_status=declined
//
// DB constraint (requests_status_check): queued | active | done | cancelled
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Position in the TV queue lifecycle.
 * Must match the DB check constraint on requests.status.
 *
 *  queued     In the queue.  request_status determines if it's visible:
 *               pending   → awaiting bartender confirmation (hidden from queue)
 *               confirmed → queue-eligible (sorted and displayed)
 *  active     Currently playing on the TV (set by advanceTVInDB).
 *  done       Slot finished or request was declined. Terminal.
 *  cancelled  Cancelled before it was played (reserved for future use).
 */
export type QueueStatus = "queued" | "active" | "done" | "cancelled";

/**
 * Bartender approval outcome.
 * Kept as a separate field so the decision is recorded even after the request
 * moves to 'done', and so customers can poll for their result.
 *
 *  pending    Awaiting bartender action.
 *  confirmed  Bartender approved — request entered (or will enter) the queue.
 *  declined   Bartender rejected — request ended at 'done', never queued.
 */
export type RequestStatus = "pending" | "confirmed" | "declined";

/**
 * Billing outcome.
 *
 *  awaiting_confirmation  Request not yet reviewed; no charge decision made.
 *  charged                Guest was charged (non-free, confirmed requests).
 *  not_charged            Free tier, or request was declined.
 */
export type PaymentStatus = "awaiting_confirmation" | "charged" | "not_charged";

export type RequestItem = {
  id: string;
  game: string;
  priority: Priority;
  createdAt: number;
};

export type PendingRequest = {
  id: string;
  tvId: string;
  tvName: string;
  game: string;
  priority: Priority;
  createdAt: number;
};

export type TV = {
  id: string;
  name: string;
  locked: boolean;
  currentGame: string | null;
  currentEndsAt: number | null;
  queue: RequestItem[];
};

export const SLOT_SECONDS = 20;

// Quick-select options shown as chips in the customer request form.
export const SAMPLE_GAMES: string[] = [
  "NFL · Broncos vs. Chiefs",
  "NBA · Lakers vs. Celtics",
  "UFC 310 · Main Card",
  "F1 · Abu Dhabi Grand Prix",
  "NHL · Avalanche vs. Golden Knights",
  "CFB · Alabama vs. Georgia",
  "MLB · Dodgers vs. Yankees",
  "EPL · Liverpool vs. Arsenal",
  "PGA · Masters Sunday",
  "Boxing · Canelo vs. Berlanga",
  "NASCAR · Cup Series Finale",
  "NBA · Warriors vs. Heat",
];

export const priorityRank: Record<Priority, number> = {
  free: 0,
  boost: 1,
  next: 2,
};

export function sortQueue(queue: RequestItem[]) {
  return [...queue].sort((a, b) => {
    // 1. Higher priority tier first (next > boost > free)
    const priorityDiff = priorityRank[b.priority] - priorityRank[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    // 2. FIFO within the same tier
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    // 3. UUID tiebreaker — seed rows inserted in the same batch share an
    //    identical created_at timestamp.  Stable lexicographic sort on id
    //    guarantees the UI "Up Next" label and the DB selection always agree.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function formatRemaining(ms: number | null) {
  if (!ms || ms <= 0) return "0s";
  const totalSeconds = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins > 0) return `${mins}:${secs.toString().padStart(2, "0")}`;
  return `${secs}s`;
}

export function priorityLabel(priority: Priority) {
  if (priority === "free") return "Free";
  if (priority === "boost") return "Boost $3";
  return "Next Up $10";
}

export function priorityColor(priority: Priority) {
  if (priority === "free") return "#6b7280";
  if (priority === "boost") return "#d97706";
  return "#dc2626";
}

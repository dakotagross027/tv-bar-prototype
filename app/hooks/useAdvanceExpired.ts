"use client";

import { useEffect, useRef, useState } from "react";
import { advanceTVInDB } from "../../lib/db";
import type { TV } from "../prototype";

/**
 * Single authoritative hook for:
 *   1. The per-second display tick (used by callers to compute remaining time)
 *   2. Expiry detection and DB advancement
 *
 * Design rationale
 * ────────────────
 * Previously every page had an identical copy of this logic:
 *   const tvsRef = useRef([]);
 *   useEffect(() => { tvsRef.current = tvs; }, [tvs]);
 *   useEffect(() => {
 *     const t = setInterval(async () => { ...advance... }, 1000);
 *     return () => clearInterval(t);
 *   }, []);
 *
 * This hook removes the duplication so any change to advance logic only needs
 * to happen once.
 *
 * Race safety
 * ───────────
 * advanceTVInDB is an atomic conditional UPDATE:
 *   UPDATE tvs SET … WHERE current_ends_at ≤ now() RETURNING id
 * If multiple clients (tabs, devices, pages) detect expiry at the same moment,
 * only the first one to hit the DB commits the write — the rest get rowCount=0
 * and return silently.  No co-ordination is needed at the client level.
 *
 * Timer authority
 * ───────────────
 * The returned tick is only for rendering:  remaining = tv.currentEndsAt - tick
 * tv.currentEndsAt is always a persisted DB timestamp, so all devices show the
 * same countdown regardless of when they mounted or refreshed.
 *
 * @param tvs      Current TV state (from component state — hook syncs via ref)
 * @param onAdvanced  Called after ≥1 successful advance so callers can reload DB state
 * @returns tick   Current Date.now() updated every second, for countdown display
 */
export function useAdvanceExpired(
  tvs: TV[],
  onAdvanced: () => Promise<void>
): number {
  const [tick, setTick] = useState(Date.now);

  // Always-current ref so the setInterval closure sees the latest TV state
  // without needing to be re-created when `tvs` changes.
  const tvsRef = useRef(tvs);
  useEffect(() => { tvsRef.current = tvs; }, [tvs]);

  // Stable ref for the callback so the interval is not re-created every render.
  const onAdvancedRef = useRef(onAdvanced);
  useEffect(() => { onAdvancedRef.current = onAdvanced; }, [onAdvanced]);

  useEffect(() => {
    const timer = setInterval(async () => {
      setTick(Date.now());
      const now = Date.now();

      // +100 ms fudge absorbs setInterval jitter so we don't miss the exact ms.
      const expired = tvsRef.current.filter(
        (tv) => tv.currentEndsAt !== null && tv.currentEndsAt <= now + 100
      );
      if (expired.length === 0) return;

      for (const tv of expired) {
        try {
          // force=false (default): atomic guard prevents double-advance.
          // If another client already claimed this advance, rowCount=0 and
          // advanceTVInDB returns silently.
          await advanceTVInDB(tv.id);
        } catch (err) {
          console.error(
            `[BarTV] useAdvanceExpired: advance failed for ${tv.id}:`,
            err instanceof Error ? err.message : err
          );
        }
      }

      // Reload DB state regardless of whether this client claimed the advance —
      // another client may have done it first and we still need fresh data.
      await onAdvancedRef.current().catch((err) =>
        console.error(
          "[BarTV] useAdvanceExpired: post-advance refresh failed:",
          err instanceof Error ? err.message : err
        )
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return tick;
}

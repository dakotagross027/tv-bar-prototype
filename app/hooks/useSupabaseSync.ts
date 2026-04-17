import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { loadTVs } from "../../lib/db";
import type { TV } from "../prototype";

/**
 * Subscribes to Supabase Realtime changes on both `tvs` and `requests` tables.
 * When any row changes from any tab or device, re-fetches the full TV state
 * and syncs it into the calling component.
 *
 * Each call gets its own uniquely-named channel so React StrictMode's
 * double-effect invocation doesn't create duplicate subscriptions.
 *
 * Stale-response protection
 * ─────────────────────────
 * A single advance operation fires 3 sequential DB mutations (TV PATCH +
 * active→done PATCH + queued→active PATCH).  Each mutation delivers a
 * separate Realtime event, triggering up to 3 concurrent loadTVs() calls.
 * With StrictMode doubling each subscription, that's 6 concurrent calls.
 * If an older call completes *after* a newer one it would overwrite fresh
 * state with stale pre-advance data, making the queue appear to un-drain.
 *
 * Fix: a monotonic generation counter.  Each refresh increments the counter
 * before the async fetch and checks it on return.  If a newer fetch has
 * started in the meantime, this result is discarded.
 *
 * Debounce
 * ────────
 * We also debounce with a 150 ms delay so that the 3 rapid-fire events from
 * one advance collapse into a single loadTVs() call that happens after all
 * three mutations have committed.
 */
/**
 * Optional callback fired after every successful loadTVs() refresh.
 * The dashboard uses this to also reload pending requests in sync with
 * realtime TV/request changes.
 */
export function useSupabaseSync(
  setTvs: Dispatch<SetStateAction<TV[]>>,
  onRefresh?: () => void
) {
  // Stable function references so the effect deps array never changes
  const setTvsRef = useRef(setTvs);
  useEffect(() => {
    setTvsRef.current = setTvs;
  }, [setTvs]);

  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    // Unique channel name per mount — avoids collisions in StrictMode
    const channelId = `tv-bar-realtime-${Math.random().toString(36).slice(2)}`;

    // Monotonic generation counter: each refresh records the counter value
    // before its async fetch; on completion it only applies the result if
    // no newer fetch has started.  This prevents stale overwrites.
    let generation = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRefresh() {
      // Collapse rapid-fire events (3 per advance) into one fetch that runs
      // after a 150 ms quiet period — by then all 3 mutations have committed.
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        debounceTimer = null;
        const myGen = ++generation;
        try {
          const fresh = await loadTVs();
          // Only apply if no newer fetch has started while we were awaiting
          if (myGen === generation) {
            setTvsRef.current(fresh);
            onRefreshRef.current?.();
          }
        } catch (err) {
          // Log but do not crash — the UI retains its last good state
          console.warn(
            "[BarTV] Realtime refresh failed:",
            err instanceof Error ? err.message : err
          );
        }
      }, 150);
    }

    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tvs" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "requests" },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []); // empty deps — setTvsRef handles the stable reference
}

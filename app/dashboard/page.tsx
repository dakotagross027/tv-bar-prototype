"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  advanceTVInDB,
  confirmRequest,
  declineRequest,
  loadPendingRequests,
  loadTVs,
  resetAllTVs,
  toggleLockInDB,
} from "../../lib/db";
import { useSupabaseSync } from "../hooks/useSupabaseSync";
import type { PendingRequest, TV } from "../prototype";
import {
  formatRemaining,
  priorityLabel,
  SLOT_SECONDS,
  sortQueue,
  type Priority,
  type RequestItem,
} from "../prototype";

export default function DashboardPage() {
  const [tvs, setTvs] = useState<TV[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [tick, setTick] = useState(Date.now());
  // Track which TVs have an in-flight advance so the button disables & spins
  const [advancing, setAdvancing] = useState<Record<string, boolean>>({});
  // Per-card error messages (keyed by TV id) shown beneath the Now Playing block
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  // In-flight confirm/decline per request id
  const [confirming, setConfirming] = useState<Record<string, boolean>>({});

  const tvsRef = useRef<TV[]>([]);
  useEffect(() => {
    tvsRef.current = tvs;
  }, [tvs]);

  // Monotonic generation counter shared by ALL loadTVs call-sites on this page.
  // Any loadTVs() call increments it before awaiting and checks it on return;
  // if a newer call started in the meantime the stale result is discarded.
  // This prevents a slow in-flight fetch (started before an advance) from
  // overwriting a fresh fetch (started after the advance) and reverting the queue.
  const loadGenRef = useRef(0);

  // Convenience wrapper: bump generation, fetch, apply only if still latest.
  async function freshLoad(label: string) {
    const myGen = ++loadGenRef.current;
    try {
      const data = await loadTVs();
      if (myGen === loadGenRef.current) setTvs(data);
    } catch (err: unknown) {
      console.error(
        `[BarTV] ${label} loadTVs failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  async function freshLoadPending() {
    try {
      const data = await loadPendingRequests();
      setPending(data);
    } catch (err: unknown) {
      console.error("[BarTV] loadPendingRequests failed:", err instanceof Error ? err.message : err);
    }
  }

  // Initial load from Supabase
  useEffect(() => {
    const myGen = ++loadGenRef.current;
    Promise.all([loadTVs(), loadPendingRequests()])
      .then(([tvData, pendingData]) => {
        if (myGen === loadGenRef.current) setTvs(tvData);
        setPending(pendingData);
      })
      .catch((err: unknown) => {
        setDbError(err instanceof Error ? err.message : "Failed to load from database");
      });
  }, []);

  // Per-second tick: update countdown display + advance expired slots.
  // After any advance, immediately re-fetch from DB rather than waiting for
  // realtime — realtime latency is the root cause of "timer hit 0, nothing happened."
  useEffect(() => {
    const timer = setInterval(async () => {
      setTick(Date.now());
      const now = Date.now();
      // Small fudge: treat "expiring within 100ms" as expired to absorb setInterval jitter
      const expired = tvsRef.current.filter(
        (tv) => tv.currentEndsAt !== null && tv.currentEndsAt <= now + 100
      );
      if (expired.length === 0) return;

      for (const tv of expired) {
        try {
          await advanceTVInDB(tv.id);
        } catch (err) {
          console.error(
            `[BarTV] timer advance failed for ${tv.id}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
      // Force-refresh UI immediately — don't rely on realtime delivery.
      // freshLoad guards against a concurrent stale realtime refresh winning.
      await freshLoad("timer");
    }, 1000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling fallback: every 15 s re-fetch so the view stays current even if
  // realtime misses an event (e.g. subscription hiccup, tab in background).
  useEffect(() => {
    const poll = setInterval(() => freshLoad("poll"), 15_000);
    return () => clearInterval(poll);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime sync: reflects changes from any tab or device instantly.
  // The onRefresh callback also reloads pending requests so the pending
  // panel stays current without a separate subscription.
  useSupabaseSync(setTvs, freshLoadPending);

  const totalRequestsTonight = useMemo(() => {
    return tvs.reduce((sum, tv) => {
      const active = tv.currentGame ? 1 : 0;
      return sum + active + tv.queue.length;
    }, 0);
  }, [tvs]);

  const activeCount = useMemo(
    () => tvs.filter((tv) => tv.currentGame !== null).length,
    [tvs]
  );

  const paidQueueCount = useMemo(() => {
    return tvs.reduce((sum, tv) => {
      return (
        sum +
        tv.queue.filter((r) => r.priority === "next" || r.priority === "boost")
          .length
      );
    }, 0);
  }, [tvs]);

  async function advanceTV(tvId: string) {
    // Clear any previous error for this card, mark as in-flight
    setCardErrors((prev) => ({ ...prev, [tvId]: "" }));
    setAdvancing((prev) => ({ ...prev, [tvId]: true }));
    try {
      await advanceTVInDB(tvId, { force: true });
      console.log(`[BarTV] advanceTV ${tvId}: DB write succeeded, refreshing UI`);
      // freshLoad bumps the generation so any concurrent stale realtime
      // refresh (triggered by the 3 DB mutations above) is discarded.
      await freshLoad(`advanceTV(${tvId})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[BarTV] advanceTV ${tvId} failed:`, msg);
      setCardErrors((prev) => ({ ...prev, [tvId]: msg }));
      // Still refresh to reflect true DB state after the failure
      await freshLoad(`advanceTV(${tvId})/recovery`);
    } finally {
      setAdvancing((prev) => ({ ...prev, [tvId]: false }));
    }
  }

  async function toggleLock(tvId: string) {
    const tv = tvs.find((t) => t.id === tvId);
    if (!tv) return;
    const newLocked = !tv.locked;

    // Optimistic update: flip the lock state immediately so the button
    // responds at click speed, not at network speed.
    setTvs((prev) =>
      prev.map((t) => (t.id === tvId ? { ...t, locked: newLocked } : t))
    );

    try {
      await toggleLockInDB(tvId, newLocked);
      // Confirm against DB — catches any drift between optimistic and real state.
      // freshLoad guards the generation so a concurrent stale refresh can't win.
      freshLoad(`toggleLock(${tvId})`).catch(() => null);
    } catch (err: unknown) {
      // Revert the optimistic update on failure
      setTvs((prev) =>
        prev.map((t) => (t.id === tvId ? { ...t, locked: tv.locked } : t))
      );
      console.error("[BarTV] toggleLock failed:", err instanceof Error ? err.message : err);
    }
  }

  async function clearAll() {
    try {
      await resetAllTVs();
      await Promise.all([freshLoad("clearAll"), freshLoadPending()]);
    } catch (err: unknown) {
      console.error("[BarTV] resetAllTVs failed:", err instanceof Error ? err.message : err);
    }
  }

  async function handleConfirm(id: string) {
    setConfirming((prev) => ({ ...prev, [id]: true }));
    try {
      await confirmRequest(id);
      await Promise.all([freshLoad("confirm"), freshLoadPending()]);
    } catch (err: unknown) {
      console.error("[BarTV] confirmRequest failed:", err instanceof Error ? err.message : err);
    } finally {
      setConfirming((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function handleDecline(id: string) {
    setConfirming((prev) => ({ ...prev, [id]: true }));
    try {
      await declineRequest(id);
      await freshLoadPending();
    } catch (err: unknown) {
      console.error("[BarTV] declineRequest failed:", err instanceof Error ? err.message : err);
    } finally {
      setConfirming((prev) => ({ ...prev, [id]: false }));
    }
  }

  if (dbError) {
    return (
      <main style={mainStyle}>
        <div style={contentStyle}>
          <div style={dbErrorStyle}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Database error</div>
            <div style={{ fontSize: 13, marginBottom: 16, color: "#fca5a5" }}>{dbError}</div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
              Run <code style={{ color: "#94a3b8" }}>supabase/migrations/001_initial_schema.sql</code>{" "}
              in your Supabase SQL Editor and verify your{" "}
              <code style={{ color: "#94a3b8" }}>.env.local</code> keys.
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (tvs.length === 0) {
    return (
      <main style={mainStyle}>
        <div style={contentStyle}>
          <div style={{ color: "#94a3b8", padding: 40, textAlign: "center" }}>
            Loading…
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={mainStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <div style={contentStyle}>
          <div style={headerInnerStyle}>
            <div style={brandStyle}>
              <span style={{ fontSize: 28, lineHeight: 1 }}>📺</span>
              <div>
                <div style={brandNameStyle}>
                  BarTV <span style={staffBadgeStyle}>STAFF</span>
                </div>
                <div style={brandTaglineStyle}>
                  Manage screens, queues, and timers
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Link href="/qr" style={qrNavLinkStyle}>
                Show QR
              </Link>
              <Link href="/overlay" style={overlayNavLinkStyle}>
                TV Overlays
              </Link>
              <Link href="/" style={navLinkStyle}>
                Customer View
              </Link>
              <button onClick={clearAll} style={resetButtonStyle}>
                Reset
              </button>
            </div>
          </div>
        </div>
      </header>

      <div style={{ ...contentStyle, paddingTop: 28, paddingBottom: 48 }}>
        {/* Stats row */}
        <div style={statsRowStyle}>
          <div style={statCardStyle}>
            <div style={statValueStyle}>{totalRequestsTonight}</div>
            <div style={statLabelStyle}>Items tonight</div>
          </div>
          <div style={statCardStyle}>
            <div style={statValueStyle}>
              {activeCount} / {tvs.length}
            </div>
            <div style={statLabelStyle}>TVs active</div>
          </div>
          <div style={statCardStyle}>
            <div
              style={{
                ...statValueStyle,
                color: paidQueueCount > 0 ? "#fbbf24" : "#f1f5f9",
              }}
            >
              {paidQueueCount}
            </div>
            <div style={statLabelStyle}>Paid requests queued</div>
          </div>
          <div style={statCardStyle}>
            <div style={statValueStyle}>{SLOT_SECONDS}s</div>
            <div style={statLabelStyle}>Slot on advance</div>
          </div>
        </div>

        {/* Pending confirmation panel */}
        {pending.length > 0 && (
          <div style={pendingSectionStyle}>
            <div style={pendingSectionHeaderStyle}>
              <div style={pendingSectionTitleStyle}>PENDING CONFIRMATION</div>
              <div style={pendingCountBadgeStyle}>{pending.length}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pending.map((req) => {
                const busy = !!confirming[req.id];
                return (
                  <div key={req.id} style={pendingRowStyle}>
                    <div style={pendingRowInfoStyle}>
                      <div style={pendingRowTvStyle}>{req.tvName}</div>
                      <div style={pendingRowGameStyle}>{req.game}</div>
                      <div style={priorityTagStyle(req.priority)}>
                        {priorityLabel(req.priority)}
                      </div>
                    </div>
                    <div style={pendingRowActionsStyle}>
                      <button
                        onClick={() => !busy && handleConfirm(req.id)}
                        disabled={busy}
                        style={confirmButtonStyle(busy)}
                      >
                        {busy ? "…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => !busy && handleDecline(req.id)}
                        disabled={busy}
                        style={declineButtonStyle(busy)}
                      >
                        {busy ? "…" : "Decline"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TV cards */}
        <div style={dashboardGridStyle}>
          {tvs.map((tv) => {
            const remaining =
              tv.currentEndsAt ? tv.currentEndsAt - tick : null;
            const sorted = sortQueue(tv.queue);
            const upNext = sorted[0] ?? null;
            const alsoQueued = sorted.slice(1);
            const urgent = remaining !== null && remaining < 10000;
            const isAdvancing = !!advancing[tv.id];
            // Can advance if: currently playing something OR there's something queued
            const canAdvance = !isAdvancing && (tv.currentGame !== null || tv.queue.length > 0);
            const cardError = cardErrors[tv.id] || "";

            return (
              <div key={tv.id} style={cardStyle(tv.locked)}>
                {/* Card header */}
                <div style={cardHeaderStyle}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <div style={tvLabelStyle}>{tv.name}</div>
                    <div style={statusDotStyle(tv.locked)} />
                    <div style={statusTextStyle(tv.locked)}>
                      {tv.locked ? "Locked" : "Open"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => canAdvance && advanceTV(tv.id)}
                      disabled={!canAdvance}
                      style={actionButtonStyle("#1d4ed8", !canAdvance)}
                      title={
                        isAdvancing
                          ? "Advancing…"
                          : canAdvance
                          ? "Advance to next in queue"
                          : "Nothing to advance"
                      }
                    >
                      {isAdvancing ? "…" : "Advance"}
                    </button>
                    <button
                      onClick={() => toggleLock(tv.id)}
                      style={actionButtonStyle(
                        tv.locked ? "#166534" : "#991b1b"
                      )}
                    >
                      {tv.locked ? "Unlock" : "Lock"}
                    </button>
                  </div>
                </div>

                {/* Now playing */}
                <div style={nowPlayingSectionStyle}>
                  <div style={nowPlayingLabelStyle}>NOW PLAYING</div>
                  <div style={nowPlayingGameStyle}>
                    {tv.currentGame ?? (
                      <span style={{ color: "#475569" }}>Idle</span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: urgent ? "#fb923c" : "#64748b",
                      fontWeight: urgent ? 700 : 400,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {tv.currentGame
                      ? `⏱ ${formatRemaining(remaining)} remaining`
                      : "No active content — queue a request"}
                  </div>
                  {cardError && (
                    <div style={cardErrorStyle}>{cardError}</div>
                  )}
                </div>

                {/* Queue section */}
                <div>
                  <div style={queueHeaderStyle}>
                    <div style={queueTitleStyle}>QUEUE</div>
                    <div style={queueCountBadgeStyle}>{tv.queue.length}</div>
                    {tv.queue.length > 0 && (
                      <div style={priorityBreakdownStyle}>
                        {queueBreakdown(tv.queue)}
                      </div>
                    )}
                  </div>

                  {sorted.length === 0 ? (
                    <div style={emptyQueueStyle}>
                      No requests yet — share the QR code
                    </div>
                  ) : (
                    <>
                      <div style={upNextBlockStyle}>
                        <div style={upNextHeaderStyle}>
                          <span style={upNextTagStyle}>UP NEXT</span>
                          <span style={priorityTagStyle(upNext!.priority)}>
                            {priorityLabel(upNext!.priority)}
                          </span>
                        </div>
                        <div style={upNextGameStyle}>{upNext!.game}</div>
                      </div>

                      {alsoQueued.length > 0 && (
                        <>
                          <div style={alsoQueuedLabelStyle}>ALSO QUEUED</div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 5,
                            }}
                          >
                            {alsoQueued.map((req, i) => (
                              <div key={req.id} style={queueItemStyle}>
                                <div style={queueItemRankStyle}>{i + 2}</div>
                                <div style={{ flex: 1 }}>
                                  <div style={queueItemGameStyle}>
                                    {req.game}
                                  </div>
                                </div>
                                <div style={priorityTagStyle(req.priority)}>
                                  {priorityLabel(req.priority)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function queueBreakdown(queue: RequestItem[]): string {
  const counts: Record<Priority, number> = { next: 0, boost: 0, free: 0 };
  for (const r of queue) counts[r.priority]++;
  const parts: string[] = [];
  if (counts.next > 0) parts.push(`${counts.next} Next Up`);
  if (counts.boost > 0) parts.push(`${counts.boost} Boost`);
  if (counts.free > 0) parts.push(`${counts.free} Free`);
  return parts.join(" · ");
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mainStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#080e1a",
  color: "#f1f5f9",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const contentStyle: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "0 20px",
};

const headerStyle: React.CSSProperties = {
  background: "#0f172a",
  borderBottom: "1px solid #1e293b",
  padding: "16px 0",
};

const headerInnerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 12,
};

const brandStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const brandNameStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: "-0.5px",
  color: "#f1f5f9",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const staffBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  background: "#7c3aed",
  color: "white",
  padding: "2px 7px",
  borderRadius: 4,
};

const brandTaglineStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 2,
};

const qrNavLinkStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#86efac",
  fontWeight: 600,
  textDecoration: "none",
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #14532d",
  background: "#052e16",
};

const overlayNavLinkStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#c4b5fd",
  fontWeight: 600,
  textDecoration: "none",
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #4c1d95",
  background: "#1e1b4b",
};

const navLinkStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#94a3b8",
  fontWeight: 600,
  textDecoration: "none",
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #1e293b",
  background: "#0f172a",
};

const resetButtonStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#fca5a5",
  fontWeight: 600,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #7f1d1d",
  background: "#1c0a0a",
  cursor: "pointer",
};

const statsRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
  marginBottom: 28,
};

const statCardStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 14,
  padding: "16px 20px",
};

const statValueStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  color: "#f1f5f9",
  fontVariantNumeric: "tabular-nums",
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 4,
};

const dashboardGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 16,
};

function cardStyle(locked: boolean): React.CSSProperties {
  return {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 18,
    padding: 22,
    opacity: locked ? 0.85 : 1,
  };
}

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 18,
};

const tvLabelStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: "#f1f5f9",
};

function statusDotStyle(locked: boolean): React.CSSProperties {
  return {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: locked ? "#ef4444" : "#22c55e",
    flexShrink: 0,
  };
}

function statusTextStyle(locked: boolean): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    color: locked ? "#fca5a5" : "#86efac",
  };
}

const nowPlayingSectionStyle: React.CSSProperties = {
  background: "#080e1a",
  borderRadius: 12,
  padding: "14px 16px",
  marginBottom: 16,
};

const nowPlayingLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "#475569",
  marginBottom: 6,
  textTransform: "uppercase",
};

const nowPlayingGameStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#f1f5f9",
  marginBottom: 6,
};

const queueHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 10,
  flexWrap: "wrap",
};

const queueTitleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "#475569",
  textTransform: "uppercase",
};

const queueCountBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  background: "#1e293b",
  color: "#94a3b8",
  borderRadius: 999,
  padding: "1px 7px",
};

const priorityBreakdownStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
};

const emptyQueueStyle: React.CSSProperties = {
  color: "#334155",
  fontSize: 13,
  padding: "10px 0",
  fontStyle: "italic",
};

const upNextBlockStyle: React.CSSProperties = {
  background: "#080e1a",
  border: "1px solid #1e293b",
  borderRadius: 10,
  padding: "10px 12px",
  marginBottom: 8,
};

const upNextHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 5,
};

const upNextTagStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.1em",
  color: "#475569",
  textTransform: "uppercase",
};

const upNextGameStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#f1f5f9",
};

const alsoQueuedLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.1em",
  color: "#334155",
  textTransform: "uppercase",
  marginBottom: 6,
};

const queueItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "#080e1a",
  border: "1px solid #1e293b",
  borderRadius: 10,
  padding: "8px 12px",
};

const queueItemRankStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
  width: 16,
  textAlign: "center",
  flexShrink: 0,
};

const queueItemGameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#94a3b8",
};

function priorityTagStyle(p: string): React.CSSProperties {
  const configs: Record<string, { bg: string; color: string; border: string }> =
    {
      free:  { bg: "#1e293b", color: "#64748b",  border: "#334155" },
      boost: { bg: "#1c1007", color: "#fbbf24",  border: "#78350f" },
      next:  { bg: "#1c0a0a", color: "#fca5a5",  border: "#7f1d1d" },
    };
  const c = configs[p] ?? configs.free;
  return {
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 6,
    background: c.bg,
    color: c.color,
    border: `1px solid ${c.border}`,
    flexShrink: 0,
    whiteSpace: "nowrap",
  };
}

function actionButtonStyle(bg: string, disabled = false): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 12px",
    borderRadius: 8,
    border: "none",
    background: disabled ? "#1e293b" : bg,
    color: disabled ? "#475569" : "white",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const dbErrorStyle: React.CSSProperties = {
  margin: "80px auto",
  maxWidth: 480,
  padding: "32px 28px",
  background: "#1c0a0a",
  border: "1px solid #7f1d1d",
  borderRadius: 16,
  color: "#fcd34d",
  textAlign: "center",
  lineHeight: 1.5,
};

const cardErrorStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "#fca5a5",
  background: "#1c0a0a",
  border: "1px solid #7f1d1d",
  borderRadius: 6,
  padding: "6px 10px",
  wordBreak: "break-word",
};

const pendingSectionStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e3a5f",
  borderRadius: 16,
  padding: "18px 20px",
  marginBottom: 24,
};

const pendingSectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 14,
};

const pendingSectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.1em",
  color: "#60a5fa",
  textTransform: "uppercase",
};

const pendingCountBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  background: "#172554",
  color: "#93c5fd",
  border: "1px solid #1e40af",
  borderRadius: 999,
  padding: "1px 8px",
};

const pendingRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  background: "#080e1a",
  border: "1px solid #1e293b",
  borderRadius: 10,
  padding: "10px 14px",
  flexWrap: "wrap",
};

const pendingRowInfoStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flex: 1,
  minWidth: 0,
  flexWrap: "wrap",
};

const pendingRowTvStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  flexShrink: 0,
};

const pendingRowGameStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#e2e8f0",
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const pendingRowActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexShrink: 0,
};

function confirmButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 14px",
    borderRadius: 8,
    border: "none",
    background: disabled ? "#1e293b" : "#166534",
    color: disabled ? "#475569" : "#86efac",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function declineButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 14px",
    borderRadius: 8,
    border: "none",
    background: disabled ? "#1e293b" : "#450a0a",
    color: disabled ? "#475569" : "#fca5a5",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

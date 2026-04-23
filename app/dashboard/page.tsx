"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAdvanceExpired } from "../hooks/useAdvanceExpired";
import { useStaffAuth } from "../hooks/useStaffAuth";
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
  sortQueue,
  type Priority,
  type RequestItem,
} from "../prototype";

// ─── Dashboard ────────────────────────────────────────────────────────────────
// Route protection is handled by middleware.ts (HMAC-signed HttpOnly cookie).
// If this component renders, the user is already authenticated.

export default function DashboardPage() {
  const { signOut } = useStaffAuth();
  return <DashboardContent onSignOut={signOut} />;
}

function DashboardContent({ onSignOut }: { onSignOut: () => void }) {
  const [tvs, setTvs] = useState<TV[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  // Track which TVs have an in-flight advance so the button disables & spins
  const [advancing, setAdvancing] = useState<Record<string, boolean>>({});
  // Per-card error messages (keyed by TV id) shown beneath the Now Playing block
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  // In-flight confirm/decline per request id
  const [confirming, setConfirming] = useState<Record<string, boolean>>({});
  // Success banner shown after a bartender confirms a request
  const [successBanner, setSuccessBanner] = useState<{ game: string; tvName: string } | null>(null);
  useEffect(() => {
    if (!successBanner) return;
    const t = setTimeout(() => setSuccessBanner(null), 5000);
    return () => clearTimeout(t);
  }, [successBanner]);
  // Show internal reset button only when ?dev param is present in the URL
  const [showReset, setShowReset] = useState(false);
  useEffect(() => {
    setShowReset(new URLSearchParams(window.location.search).has("dev"));
  }, []);

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

  // Single hook drives the 1-second tick for countdown display AND advances
  // expired slots.  The DB's atomic conditional UPDATE prevents double-advance.
  const tick = useAdvanceExpired(tvs, () => freshLoad("timer"));

  // Polling fallback: every 15 s re-fetch so the view stays current even if
  // realtime misses an event (e.g. subscription hiccup, tab in background).
  // Both TV state and pending requests are refreshed together.
  useEffect(() => {
    const poll = setInterval(() => {
      freshLoad("poll");
      freshLoadPending();
    }, 15_000);
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

  const revenueInQueue = useMemo(() => {
    return tvs.reduce((sum, tv) => {
      return sum + tv.queue.reduce((s, r) => {
        if (r.priority === "next")  return s + 10;
        if (r.priority === "boost") return s + 3;
        return s;
      }, 0);
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
    const req = pending.find((r) => r.id === id);
    setConfirming((prev) => ({ ...prev, [id]: true }));
    try {
      await confirmRequest(id);
      await Promise.all([freshLoad("confirm"), freshLoadPending()]);
      if (req) setSuccessBanner({ game: req.game, tvName: req.tvName });
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
                  Live bar management
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
                Guest View
              </Link>
              <button onClick={onSignOut} style={signOutButtonStyle}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div style={{ ...contentStyle, paddingTop: 28, paddingBottom: 48 }}>
        {/* Stats row */}
        <div style={statsRowStyle}>
          <div style={statCardStyle}>
            <div style={{ ...statValueStyle, color: revenueInQueue > 0 ? "#86efac" : "#f1f5f9" }}>
              ${revenueInQueue}
            </div>
            <div style={statLabelStyle}>Revenue Tonight</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ ...statValueStyle, color: paidQueueCount > 0 ? "#fbbf24" : "#f1f5f9" }}>
              {paidQueueCount}
            </div>
            <div style={statLabelStyle}>Paid Requests Waiting</div>
          </div>
          <div style={statCardStyle}>
            <div style={statValueStyle}>
              {activeCount} / {tvs.length}
            </div>
            <div style={statLabelStyle}>Screens Active</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ ...statValueStyle, color: pending.length > 0 ? "#f87171" : "#f1f5f9" }}>
              {pending.length}
            </div>
            <div style={statLabelStyle}>Bartender Actions</div>
          </div>
        </div>

        {/* Success banner — shown after bartender confirms a request */}
        {successBanner && (
          <div style={successBannerStyle}>
            <div style={successBannerIconStyle}>✓</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={successBannerTitleStyle}>
                Now Playing on {successBanner.tvName}
              </div>
              <div style={successBannerGameStyle}>{successBanner.game}</div>
            </div>
            <button onClick={() => setSuccessBanner(null)} style={successBannerDismissStyle}>×</button>
          </div>
        )}

        {/* Pending confirmation panel */}
        {pending.length > 0 && (
          <div style={pendingSectionStyle}>
            <div style={pendingSectionHeaderStyle}>
              <div style={pendingSectionTitleStyle}>⚡ NEW REQUESTS WAITING</div>
              <div style={pendingCountBadgeStyle}>{pending.length}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pending.map((req) => {
                const busy = !!confirming[req.id];
                return (
                  <div key={req.id} style={pendingCardItemStyle}>
                    <div style={pendingCardTopBarStyle}>
                      <span style={pendingNewLabelStyle}>NEW REQUEST</span>
                      <span style={pendingTimeAgoStyle}>{timeAgo(req.createdAt)}</span>
                    </div>
                    <div style={pendingCardBodyStyle}>
                      <div style={pendingDetailRowStyle}>
                        <span style={pendingDetailLabelStyle}>Screen</span>
                        <span style={pendingDetailValueStyle}>{req.tvName}</span>
                      </div>
                      <div style={pendingDetailRowStyle}>
                        <span style={pendingDetailLabelStyle}>Game</span>
                        <span style={pendingDetailValueStyle}>{req.game}</span>
                      </div>
                      <div style={pendingDetailRowStyle}>
                        <span style={pendingDetailLabelStyle}>Tier</span>
                        <span style={priorityTagStyle(req.priority)}>{priorityLabel(req.priority)}</span>
                      </div>
                    </div>
                    <div style={pendingCardActionsStyle}>
                      <button
                        onClick={() => !busy && handleConfirm(req.id)}
                        disabled={busy}
                        style={confirmButtonStyle(busy)}
                      >
                        {busy ? "…" : "✓ Confirm"}
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
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={tvLabelStyle}>{tv.name}</div>
                    {tv.locked ? (
                      <span style={lockedBadgeStyle}>🔒 Locked</span>
                    ) : (
                      <span style={autoBadgeStyle} title="Timer-based auto-advance is active">⚡ Auto</span>
                    )}
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
                          ? "Skip to next in queue"
                          : "Nothing to advance"
                      }
                    >
                      {isAdvancing ? "…" : "Skip"}
                    </button>
                    <button
                      onClick={() => toggleLock(tv.id)}
                      style={actionButtonStyle(
                        tv.locked ? "#166534" : "#7c3aed"
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
                      <span style={{ color: "#22c55e", fontSize: 15 }}>Available Now</span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: urgent ? "#fb923c" : tv.currentGame ? "#64748b" : "#334155",
                      fontWeight: urgent ? 700 : 400,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {tv.currentGame
                      ? `⏱ ${formatRemaining(remaining)} remaining`
                      : "Open — guests can request this screen"}
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
                      Queue is open — share the QR to get requests
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

        {/* Internal tools — only visible at /dashboard?dev */}
        {showReset && (
          <div style={resetZoneStyle}>
            <button onClick={clearAll} style={resetButtonStyle}>
              Reset to demo state
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  return `${mins} min ago`;
}

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

const signOutButtonStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#94a3b8",
  fontWeight: 600,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #1e293b",
  background: "#0f172a",
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

const autoBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
  background: "#052e16",
  color: "#86efac",
  border: "1px solid #14532d",
};

const lockedBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
  background: "#1c0a0a",
  color: "#fca5a5",
  border: "1px solid #7f1d1d",
};

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
  background: "#0a1628",
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
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.08em",
  color: "#f87171",
  textTransform: "uppercase",
};

const pendingCountBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  background: "#450a0a",
  color: "#fca5a5",
  border: "1px solid #7f1d1d",
  borderRadius: 999,
  padding: "1px 8px",
};

const pendingCardItemStyle: React.CSSProperties = {
  background: "#080e1a",
  border: "1px solid #1e3a5f",
  borderLeft: "3px solid #3b82f6",
  borderRadius: 10,
  overflow: "hidden",
};

const pendingCardTopBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 14px",
  background: "#0d1f3c",
  borderBottom: "1px solid #1e3a5f",
};

const pendingNewLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.1em",
  color: "#60a5fa",
  textTransform: "uppercase",
};

const pendingTimeAgoStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#475569",
  fontWeight: 500,
};

const pendingCardBodyStyle: React.CSSProperties = {
  padding: "12px 14px 8px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const pendingDetailRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
};

const pendingDetailLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#334155",
  width: 44,
  flexShrink: 0,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const pendingDetailValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#e2e8f0",
};

const pendingCardActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "10px 14px 12px",
};

function confirmButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    fontSize: 14,
    fontWeight: 800,
    padding: "11px 16px",
    borderRadius: 10,
    border: "none",
    background: disabled ? "#1e293b" : "#16a34a",
    color: disabled ? "#475569" : "#ffffff",
    cursor: disabled ? "not-allowed" : "pointer",
    letterSpacing: "0.01em",
  };
}

function declineButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    fontSize: 13,
    fontWeight: 600,
    padding: "11px 14px",
    borderRadius: 10,
    border: "1px solid #1e293b",
    background: "transparent",
    color: disabled ? "#334155" : "#64748b",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

// Success banner
const successBannerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  background: "linear-gradient(135deg, #052e16 0%, #0a3622 100%)",
  border: "1px solid #16a34a",
  borderRadius: 14,
  padding: "16px 20px",
  marginBottom: 20,
  boxShadow: "0 0 24px rgba(22,163,74,0.25), 0 0 0 1px rgba(22,163,74,0.1)",
};

const successBannerIconStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "#16a34a",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 18,
  fontWeight: 800,
  flexShrink: 0,
};

const successBannerTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#86efac",
  marginBottom: 2,
};

const successBannerGameStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#4ade80",
  fontWeight: 500,
};

const successBannerDismissStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#166534",
  fontSize: 20,
  cursor: "pointer",
  padding: "0 4px",
  lineHeight: 1,
  flexShrink: 0,
};

// Reset zone
const resetZoneStyle: React.CSSProperties = {
  marginTop: 48,
  paddingTop: 24,
  borderTop: "1px solid #0f172a",
  display: "flex",
  justifyContent: "center",
};

const resetButtonStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  fontWeight: 500,
  padding: "6px 14px",
  borderRadius: 8,
  border: "1px solid #1e293b",
  background: "none",
  cursor: "pointer",
};


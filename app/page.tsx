"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { addRequest, advanceTVInDB, loadRequestStatus, loadTVs, resetAllTVs } from "../lib/db";
import { useSupabaseSync } from "./hooks/useSupabaseSync";
import {
  type Priority,
  type RequestStatus,
  type TV,
  formatRemaining,
  priorityLabel,
  SAMPLE_GAMES,
} from "./prototype";

export default function Home() {
  const [tvs, setTvs] = useState<TV[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [selectedTvId, setSelectedTvId] = useState<string>("A");
  const [gameName, setGameName] = useState("");
  const [priority, setPriority] = useState<Priority>("free");
  const [tick, setTick] = useState(Date.now());
  const [message, setMessage] = useState("");

  // Pending confirmation tracking: set after a successful submit,
  // cleared when user dismisses or status becomes final.
  const [submittedReq, setSubmittedReq] = useState<{
    id: string;
    game: string;
    tvName: string;
    priority: Priority;
  } | null>(null);
  const [submittedStatus, setSubmittedStatus] = useState<RequestStatus>("pending");

  // Always-fresh ref so the setInterval closure sees current TV state.
  const tvsRef = useRef<TV[]>([]);
  useEffect(() => { tvsRef.current = tvs; }, [tvs]);

  // Monotonic generation counter — shared by all explicit loadTVs call-sites.
  // Any call increments the counter before awaiting; on return it only applies
  // the result if no newer call started.  Prevents a slow pre-advance fetch
  // from overwriting a fresh post-advance fetch and reverting the queue.
  const loadGenRef = useRef(0);

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

  // Initial load from Supabase
  useEffect(() => {
    const myGen = ++loadGenRef.current;
    loadTVs()
      .then((data) => { if (myGen === loadGenRef.current) setTvs(data); })
      .catch((err: unknown) => {
        setDbError(err instanceof Error ? err.message : "Failed to load from database");
      });
  }, []);

  // Per-second tick: drives countdown display AND advances any expired slots.
  //
  // Why advance here too (not just on the staff/overlay pages)?
  // The atomic conditional UPDATE — WHERE current_ends_at ≤ now() RETURNING id —
  // means only ONE tab can ever claim a given advance; concurrent tabs get 0 rows
  // back and return silently.  So there is no multi-tab double-advance race.
  // Without this timer, a customer who has ONLY the customer page open sees the
  // countdown hit 0s but the queue never moves, because no other page is running.
  useEffect(() => {
    const timer = setInterval(async () => {
      setTick(Date.now());
      const now = Date.now();
      // +100ms fudge absorbs setInterval jitter so we don't miss the exact ms
      const expired = tvsRef.current.filter(
        (tv) => tv.currentEndsAt !== null && tv.currentEndsAt <= now + 100
      );
      if (expired.length === 0) return;

      for (const tv of expired) {
        try {
          await advanceTVInDB(tv.id);
        } catch (err) {
          console.error(
            `[BarTV] customer advance failed for ${tv.id}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
      // freshLoad bumps the generation so any concurrent stale realtime refresh
      // (triggered by the DB mutations above) is discarded.
      await freshLoad("customer-timer");
    }, 1000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling fallback: 5-second interval ensures the view stays current even if
  // realtime misses an event (background tab, WebSocket hiccup, etc.).
  // 5s is fast enough to feel live without hammering the API.
  useEffect(() => {
    const poll = setInterval(() => freshLoad("customer-poll"), 5_000);
    return () => clearInterval(poll);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime sync: reflects changes from any other tab or device instantly
  useSupabaseSync(setTvs);

  // Poll for confirmation status on the submitted request (2s interval).
  // Stops polling once confirmed or declined.
  useEffect(() => {
    if (!submittedReq || submittedStatus !== "pending") return;
    const poll = setInterval(async () => {
      try {
        const status = await loadRequestStatus(submittedReq.id);
        setSubmittedStatus(status);
      } catch {
        // ignore transient errors — keep polling
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [submittedReq, submittedStatus]);

  // Auto-clear feedback messages after 5 seconds
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  const openTvCount = useMemo(
    () => tvs.filter((tv) => !tv.locked).length,
    [tvs]
  );

  const allLocked = useMemo(() => tvs.every((tv) => tv.locked), [tvs]);

  const selectedTv = tvs.find((tv) => tv.id === selectedTvId) ?? tvs[0];
  const peopleAhead = selectedTv ? selectedTv.queue.length : 0;

  async function submitRequest() {
    const trimmed = gameName.trim();

    if (!trimmed) {
      setMessage("Please enter a game or event name.");
      return;
    }

    if (!selectedTv) {
      setMessage("No TV selected. Please tap a TV above.");
      return;
    }

    // Re-check locked state at submission time — TV might have been locked
    // by staff between when the page loaded and now.
    if (selectedTv.locked) {
      setMessage(
        "This TV was just locked by staff. Please choose a different screen."
      );
      return;
    }

    try {
      const id = await addRequest(selectedTvId, trimmed, priority);
      // Show pending confirmation card instead of a toast
      setSubmittedReq({ id, game: trimmed, tvName: selectedTv.name, priority });
      setSubmittedStatus("pending");
      setGameName("");
      setPriority("free");
      setMessage("");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : "Request failed. Please try again.");
    }
  }

  async function clearAll() {
    try {
      await resetAllTVs();
      setSelectedTvId("A");
      setGameName("");
      setPriority("free");
      setMessage("Prototype reset.");
      freshLoad("clearAll").catch(console.error);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? `Reset failed: ${err.message}` : "Reset failed.");
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
              Make sure you have run the SQL migration in Supabase and that
              your <code style={{ color: "#94a3b8" }}>.env.local</code> keys are correct.
              <br />See <code style={{ color: "#94a3b8" }}>supabase/migrations/001_initial_schema.sql</code>
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

  const submitDisabled = !selectedTv || selectedTv.locked || allLocked;

  return (
    <main style={mainStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <div style={contentStyle}>
          <div style={headerInnerStyle}>
            <div style={brandStyle}>
              <span style={{ fontSize: 30, lineHeight: 1 }}>📺</span>
              <div>
                <div style={brandNameStyle}>BarTV</div>
                <div style={brandTaglineStyle}>
                  Request what&apos;s on the TVs — no bartender needed
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={liveBadge}>
                <span style={liveDot} />
                {openTvCount} TV{openTvCount !== 1 ? "s" : ""} open
              </span>
              <Link href="/dashboard" style={navLinkStyle}>
                Staff →
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div style={{ ...contentStyle, paddingTop: 32, paddingBottom: 56 }}>
        {/* TV grid */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionHeadingStyle}>Choose a TV</h2>
          <p style={sectionSubStyle}>
            Tap the screen you want to request — then fill in below
          </p>
          <div style={tvGridStyle}>
            {tvs.map((tv) => {
              const remaining =
                tv.currentEndsAt ? tv.currentEndsAt - tick : null;
              const isSelected = selectedTvId === tv.id;

              return (
                <div
                  key={tv.id}
                  onClick={() => !tv.locked && setSelectedTvId(tv.id)}
                  style={tvCardStyle(isSelected, tv.locked)}
                >
                  <div style={tvCardHeaderStyle}>
                    <div style={tvNameStyle}>{tv.name}</div>
                    <div style={statusBadgeStyle(tv.locked)}>
                      <span style={{ fontSize: 8 }}>●</span>{" "}
                      {tv.locked ? "Locked" : "Open"}
                    </div>
                  </div>

                  <div style={nowPlayingLabelStyle}>NOW PLAYING</div>
                  <div style={nowPlayingGameStyle}>
                    {tv.currentGame ?? (
                      <span style={{ color: "#22c55e", fontSize: 13 }}>
                        Open — be the first to request
                      </span>
                    )}
                  </div>

                  <div style={tvFooterStyle}>
                    <div style={timerStyle}>
                      {tv.currentGame
                        ? `⏱ ${formatRemaining(remaining)}`
                        : "Idle"}
                    </div>
                    <div style={queueBadgeStyle(tv.queue.length > 0)}>
                      {tv.queue.length > 0
                        ? `${tv.queue.length} in queue`
                        : "Queue empty"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Request form */}
        <section style={formPanelStyle}>
          <h2 style={{ ...sectionHeadingStyle, marginBottom: 4 }}>
            What do you want to watch?
          </h2>
          <p style={sectionSubStyle}>
            Requesting on:{" "}
            <strong style={{ color: "#f1f5f9" }}>
              {selectedTv?.name ?? "—"}
            </strong>
          </p>

          {/* Locked state warnings — all-locked takes priority */}
          {allLocked ? (
            <div style={allLockedBannerStyle}>
              🔒 All screens are currently managed by staff. Please check back
              in a moment.
            </div>
          ) : selectedTv?.locked ? (
            <div style={lockedWarningStyle}>
              🔒 This TV is locked by staff. Try selecting a different screen
              above.
            </div>
          ) : null}

          {/* Game input + quick-select chips */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Game or event</label>
            <input
              value={gameName}
              onChange={(e) => {
                setGameName(e.target.value);
                if (message && !message.startsWith("✓")) setMessage("");
              }}
              onKeyDown={(e) => e.key === "Enter" && submitRequest()}
              placeholder="Type a game, or pick one below…"
              style={inputStyle}
              disabled={submitDisabled}
              maxLength={80}
            />
            <div style={chipRowStyle}>
              {SAMPLE_GAMES.slice(0, 8).map((game) => (
                <button
                  key={game}
                  onClick={() => setGameName(game)}
                  style={chipStyle(gameName === game)}
                  disabled={submitDisabled}
                >
                  {game}
                </button>
              ))}
            </div>
          </div>

          {/* Priority selector */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Choose your priority</label>
            <div style={priorityGridStyle}>
              {(["free", "boost", "next"] as Priority[]).map((p) => {
                const isActive = priority === p;
                return (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    style={priorityCardStyle(p, isActive)}
                    disabled={submitDisabled}
                  >
                    {p === "boost" && (
                      <div style={popularBadgeStyle}>POPULAR</div>
                    )}
                    <div style={priorityCardTopStyle}>
                      <div style={priorityCardNameStyle}>
                        {priorityName(p)}
                      </div>
                      <div style={priorityPriceStyle(p)}>
                        {priorityPrice(p)}
                      </div>
                    </div>
                    <div style={priorityCardDescStyle}>
                      {priorityDesc(p)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Queue position alert */}
          {peopleAhead > 0 && !submitDisabled && (
            <div style={queueAlertStyle(peopleAhead, priority)}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                You&apos;re #{peopleAhead + 1} in line on {selectedTv?.name}
              </div>
              {priority === "free" && peopleAhead >= 2 && (
                <div style={{ fontSize: 13, opacity: 0.85 }}>
                  Boost for $3 to jump ahead, or go next for $10.
                </div>
              )}
              {priority === "free" && peopleAhead === 1 && (
                <div style={{ fontSize: 13, opacity: 0.85 }}>
                  One person ahead — Boost for $3 to jump them.
                </div>
              )}
              {priority === "boost" && (
                <div style={{ fontSize: 13, opacity: 0.85 }}>
                  You&apos;ll jump ahead of free requests. Upgrade to Next Up
                  to guarantee #1.
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={submitRequest}
            disabled={submitDisabled}
            style={submitButtonStyle(priority, submitDisabled)}
          >
            {allLocked
              ? "All TVs locked by staff"
              : submitDisabled
              ? "TV is locked by staff"
              : submitLabel(priority)}
          </button>

          {message && (
            <div style={messageStyle(message.startsWith("✓"))}>
              {message}
            </div>
          )}

          {/* Pending confirmation card */}
          {submittedReq && (
            <div style={pendingCardStyle(submittedStatus)}>
              <div style={pendingCardHeaderStyle}>
                <div style={pendingStatusIconStyle(submittedStatus)}>
                  {submittedStatus === "pending"   && "⏳"}
                  {submittedStatus === "confirmed" && "✓"}
                  {submittedStatus === "declined"  && "✕"}
                </div>
                <div>
                  <div style={pendingCardTitleStyle(submittedStatus)}>
                    {submittedStatus === "pending"   && "Pending bartender confirmation"}
                    {submittedStatus === "confirmed" && "Request confirmed!"}
                    {submittedStatus === "declined"  && "Request declined"}
                  </div>
                  <div style={pendingCardSubStyle}>
                    {submittedReq.game} · {submittedReq.tvName} ·{" "}
                    {priorityLabel(submittedReq.priority)}
                  </div>
                </div>
                <button
                  onClick={() => setSubmittedReq(null)}
                  style={pendingDismissStyle}
                  title="Dismiss"
                >
                  ×
                </button>
              </div>
              {submittedStatus === "pending" && (
                <div style={pendingHintStyle}>
                  Show this to your bartender or wait for them to confirm.
                </div>
              )}
              {submittedStatus === "confirmed" && (
                <div style={pendingHintStyle}>
                  Your request is in the queue — watch the TV for your turn!
                </div>
              )}
              {submittedStatus === "declined" && (
                <div style={pendingHintStyle}>
                  The bartender declined this request. You have not been charged.
                </div>
              )}
            </div>
          )}
        </section>

        <div style={{ textAlign: "right", marginTop: 16 }}>
          <button onClick={clearAll} style={resetLinkStyle}>
            Reset prototype
          </button>
        </div>
      </div>
    </main>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function priorityName(p: Priority): string {
  if (p === "free") return "Free";
  if (p === "boost") return "Boost";
  return "Next Up";
}

function priorityPrice(p: Priority): string {
  if (p === "free") return "Free";
  if (p === "boost") return "$3";
  return "$10";
}

function priorityDesc(p: Priority): string {
  if (p === "free") return "Join the queue, no charge.";
  if (p === "boost") return "Jump ahead of everyone who chose Free.";
  return "You're up next. Guaranteed, no matter the queue.";
}

function submitLabel(p: Priority): string {
  if (p === "free") return "Join Queue — Free";
  if (p === "boost") return "Boost My Spot — $3";
  return "Go Next — $10";
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
  maxWidth: 900,
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
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: "-0.5px",
  color: "#f1f5f9",
};

const brandTaglineStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 2,
};

const liveBadge: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: "#86efac",
  background: "#052e16",
  border: "1px solid #14532d",
  padding: "4px 10px",
  borderRadius: 999,
  fontWeight: 600,
};

const liveDot: React.CSSProperties = {
  display: "inline-block",
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "#22c55e",
};

const navLinkStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#60a5fa",
  fontWeight: 600,
  textDecoration: "none",
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #1e40af",
  background: "#172554",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  margin: 0,
  color: "#f1f5f9",
};

const sectionSubStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#64748b",
  margin: "4px 0 16px",
};

const tvGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

function tvCardStyle(
  isSelected: boolean,
  locked: boolean
): React.CSSProperties {
  return {
    background: "#0f172a",
    border: isSelected ? "2px solid #3b82f6" : "1px solid #1e293b",
    borderRadius: 16,
    padding: 20,
    cursor: locked ? "not-allowed" : "pointer",
    opacity: locked ? 0.6 : 1,
    boxShadow: isSelected ? "0 0 0 3px rgba(59,130,246,0.12)" : "none",
  };
}

const tvCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
};

const tvNameStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#f1f5f9",
};

function statusBadgeStyle(locked: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 999,
    background: locked ? "#450a0a" : "#052e16",
    color: locked ? "#fca5a5" : "#86efac",
    border: locked ? "1px solid #7f1d1d" : "1px solid #14532d",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };
}

const nowPlayingLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "#475569",
  marginBottom: 4,
  textTransform: "uppercase",
};

const nowPlayingGameStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#e2e8f0",
  marginBottom: 16,
  minHeight: 22,
};

const tvFooterStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const timerStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#94a3b8",
  fontVariantNumeric: "tabular-nums",
};

function queueBadgeStyle(hasItems: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 999,
    background: hasItems ? "#1c1917" : "transparent",
    color: hasItems ? "#fbbf24" : "#475569",
    border: hasItems ? "1px solid #44403c" : "1px solid transparent",
  };
}

const formPanelStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 20,
  padding: 28,
};

const allLockedBannerStyle: React.CSSProperties = {
  background: "#1c1007",
  border: "1px solid #78350f",
  borderRadius: 10,
  padding: "14px 16px",
  color: "#fcd34d",
  fontSize: 14,
  marginBottom: 20,
  fontWeight: 500,
};

const lockedWarningStyle: React.CSSProperties = {
  background: "#1c0a0a",
  border: "1px solid #7f1d1d",
  borderRadius: 10,
  padding: "12px 16px",
  color: "#fca5a5",
  fontSize: 14,
  marginBottom: 20,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  marginBottom: 8,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 12,
  border: "1px solid #1e293b",
  background: "#080e1a",
  color: "#f1f5f9",
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
};

const chipRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 10,
};

function chipStyle(isSelected: boolean): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 11px",
    borderRadius: 999,
    border: isSelected ? "1px solid #3b82f6" : "1px solid #1e293b",
    background: isSelected ? "#172554" : "#080e1a",
    color: isSelected ? "#60a5fa" : "#64748b",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

const priorityGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
};

function priorityCardStyle(
  p: Priority,
  isActive: boolean
): React.CSSProperties {
  const accent =
    p === "free" ? "#6b7280" : p === "boost" ? "#f59e0b" : "#ef4444";
  return {
    padding: "14px 16px",
    borderRadius: 14,
    textAlign: "left",
    border: isActive ? `2px solid ${accent}` : "1px solid #1e293b",
    background: isActive ? "#111827" : "#080e1a",
    color: "white",
    cursor: "pointer",
    boxSizing: "border-box",
    position: "relative",
  };
}

const popularBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.08em",
  color: "#fbbf24",
  background: "rgba(180,83,9,0.2)",
  border: "1px solid rgba(245,158,11,0.3)",
  borderRadius: 4,
  padding: "1px 5px",
  display: "inline-block",
  marginBottom: 8,
};

const priorityCardTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 6,
};

const priorityCardNameStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 15,
  color: "#f1f5f9",
};

function priorityPriceStyle(p: Priority): React.CSSProperties {
  const color =
    p === "free" ? "#6b7280" : p === "boost" ? "#f59e0b" : "#ef4444";
  return { fontSize: 15, fontWeight: 800, color };
}

const priorityCardDescStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.4,
};

function queueAlertStyle(
  peopleAhead: number,
  priority: Priority
): React.CSSProperties {
  const urgent = peopleAhead >= 2 && priority === "free";
  return {
    marginBottom: 20,
    padding: "12px 16px",
    borderRadius: 10,
    background: urgent ? "#1c1007" : "#111827",
    border: urgent ? "1px solid #78350f" : "1px solid #1e293b",
    color: urgent ? "#fcd34d" : "#94a3b8",
    fontSize: 14,
  };
}

function submitButtonStyle(
  p: Priority,
  disabled: boolean
): React.CSSProperties {
  const bg = disabled
    ? "#1e293b"
    : p === "next"
    ? "#b91c1c"
    : p === "boost"
    ? "#b45309"
    : "#1d4ed8";
  return {
    width: "100%",
    padding: "16px",
    borderRadius: 14,
    border: "none",
    background: bg,
    color: disabled ? "#64748b" : "white",
    fontWeight: 700,
    fontSize: 16,
    cursor: disabled ? "not-allowed" : "pointer",
    marginBottom: 4,
    letterSpacing: "0.01em",
  };
}

function messageStyle(success: boolean): React.CSSProperties {
  return {
    marginTop: 14,
    padding: "12px 16px",
    borderRadius: 10,
    background: success ? "#052e16" : "#1c0a0a",
    border: success ? "1px solid #14532d" : "1px solid #7f1d1d",
    color: success ? "#86efac" : "#fca5a5",
    fontSize: 14,
    fontWeight: 600,
  };
}

const resetLinkStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#334155",
  fontSize: 12,
  cursor: "pointer",
  textDecoration: "underline",
};

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

function pendingCardStyle(status: RequestStatus): React.CSSProperties {
  const configs = {
    pending:   { bg: "#111827", border: "#1e3a5f" },
    confirmed: { bg: "#052e16", border: "#14532d" },
    declined:  { bg: "#1c0a0a", border: "#7f1d1d" },
  };
  const c = configs[status];
  return {
    marginTop: 16,
    padding: "14px 16px",
    borderRadius: 12,
    background: c.bg,
    border: `1px solid ${c.border}`,
  };
}

const pendingCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
};

function pendingStatusIconStyle(status: RequestStatus): React.CSSProperties {
  const color =
    status === "confirmed" ? "#86efac" :
    status === "declined"  ? "#fca5a5" :
    "#93c5fd";
  return { fontSize: 20, lineHeight: 1, color, flexShrink: 0 };
}

function pendingCardTitleStyle(status: RequestStatus): React.CSSProperties {
  const color =
    status === "confirmed" ? "#86efac" :
    status === "declined"  ? "#fca5a5" :
    "#93c5fd";
  return { fontWeight: 700, fontSize: 14, color };
}

const pendingCardSubStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 2,
};

const pendingHintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  marginTop: 10,
  lineHeight: 1.5,
};

const pendingDismissStyle: React.CSSProperties = {
  marginLeft: "auto",
  background: "none",
  border: "none",
  color: "#475569",
  fontSize: 20,
  lineHeight: 1,
  cursor: "pointer",
  padding: "0 4px",
  flexShrink: 0,
};


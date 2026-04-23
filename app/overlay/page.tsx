"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { loadTVs } from "../../lib/db";
import { useAdvanceExpired } from "../hooks/useAdvanceExpired";
import { useSupabaseSync } from "../hooks/useSupabaseSync";
import {
  type Priority,
  formatRemaining,
  priorityLabel,
  sortQueue,
} from "../prototype";

export default function OverlayPage() {
  const [tvs, setTvs] = useState<Awaited<ReturnType<typeof loadTVs>>>([]);
  const [dbError, setDbError] = useState<string | null>(null);

  // Monotonic generation counter: prevents a slow stale fetch from overwriting
  // a newer one when multiple concurrent refreshes are in flight.
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

  // Initial load
  useEffect(() => {
    const myGen = ++loadGenRef.current;
    loadTVs()
      .then((data) => { if (myGen === loadGenRef.current) setTvs(data); })
      .catch((err: unknown) => {
        setDbError(err instanceof Error ? err.message : "Failed to load from database");
      });
  }, []);

  // Single hook: 1-second tick for countdown display + advances expired slots.
  const tick = useAdvanceExpired(tvs, () => freshLoad("overlay-timer"));

  // Polling fallback: 5s keeps overlay current even if realtime is interrupted.
  // Generation-guarded via freshLoad to prevent stale overwrites.
  useEffect(() => {
    const poll = setInterval(() => freshLoad("overlay-poll"), 5_000);
    return () => clearInterval(poll);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime sync: overlay reflects dashboard actions without a page refresh
  useSupabaseSync(setTvs);

  if (dbError) {
    return (
      <main style={mainStyle}>
        <div style={{ color: "#fca5a5", padding: 40, textAlign: "center", maxWidth: 480, margin: "0 auto" }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>⚠️ Database error</div>
          <div style={{ fontSize: 13 }}>{dbError}</div>
        </div>
      </main>
    );
  }

  if (tvs.length === 0) {
    return (
      <main style={mainStyle}>
        <div style={{ color: "#94a3b8", padding: 40, textAlign: "center" }}>
          Loading…
        </div>
      </main>
    );
  }

  return (
    <main style={mainStyle}>
      {/* Page header */}
      <header style={pageHeaderStyle}>
        <div style={pageHeaderInnerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>📺</span>
            <div>
              <span style={pageTitleStyle}>Live Screen View</span>
              <span style={pageSubStyle}>
                {" "}
                — exactly what guests see on each screen right now
              </span>
            </div>
          </div>
          <Link href="/dashboard" style={backLinkStyle}>
            ← Dashboard
          </Link>
        </div>
      </header>

      {/* TV grid */}
      <div style={tvGridStyle}>
        {tvs.map((tv) => {
          const remaining =
            tv.currentEndsAt ? tv.currentEndsAt - tick : null;
          const sorted = sortQueue(tv.queue);
          const upNext = sorted[0] ?? null;

          return (
            <div key={tv.id}>
              {/* Label above the screen */}
              <div style={screenLabelRowStyle}>
                <span style={screenLabelStyle}>{tv.name}</span>
                {tv.locked && (
                  <span style={lockedTagStyle}>🔒 Locked</span>
                )}
              </div>

              {/* TV bezel frame */}
              <div style={tvFrameStyle}>
                {/* 16:9 screen area — all children must be position:absolute */}
                <div style={screenStyle}>
                  {/* LIVE badge — top left */}
                  <div style={liveBadgeStyle}>
                    <span className="live-pulse" style={liveDotStyle} />
                    LIVE
                  </div>

                  {/* Idle state */}
                  {!tv.currentGame && !tv.locked && (
                    <div style={centerMessageStyle}>
                      <div style={centerMessageHeadStyle}>No active content</div>
                      <div style={centerMessageSubStyle}>
                        Accepting requests via BarTV
                      </div>
                    </div>
                  )}

                  {/* Locked state */}
                  {tv.locked && (
                    <div style={centerMessageStyle}>
                      <div style={centerMessageHeadStyle}>
                        🔒 Managed by staff
                      </div>
                      <div style={centerMessageSubStyle}>
                        Requests are paused
                      </div>
                    </div>
                  )}

                  {/* Lower-third overlay — only shown when there is active content */}
                  {tv.currentGame && (
                    <div style={lowerThirdStyle}>
                      {/* Accent bar */}
                      <div style={accentBarStyle} />

                      {/* Main body */}
                      <div style={lowerThirdBodyStyle}>
                        {/* Row 1: game name + countdown */}
                        <div style={mainRowStyle}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={nowPlayingTagStyle}>NOW PLAYING</div>
                            <div style={gameNameStyle}>{tv.currentGame}</div>
                          </div>
                          <div style={countdownBoxStyle(remaining)}>
                            <div style={countdownLabelStyle}>TIME LEFT</div>
                            <div style={countdownValueStyle(remaining)}>
                              {formatRemaining(remaining)}
                            </div>
                          </div>
                        </div>

                        {/* Row 2: up next */}
                        <div style={upNextRowStyle}>
                          <span style={upNextTagStyle}>UP NEXT</span>
                          {upNext ? (
                            <>
                              <span style={upNextGameStyle}>
                                {upNext.game}
                              </span>
                              <span
                                style={priorityPillStyle(upNext.priority)}
                              >
                                {priorityLabel(upNext.priority)}
                              </span>
                            </>
                          ) : (
                            <span style={upNextEmptyStyle}>
                              Nothing queued
                            </span>
                          )}
                          <span style={appBrandingStyle}>
                            · via BarTV app
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={footerStyle}>
        <Link href="/" style={footerLinkStyle}>
          Guest view
        </Link>{" "}
        ·{" "}
        <Link href="/dashboard" style={footerLinkStyle}>
          Dashboard
        </Link>
      </div>
    </main>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mainStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#060b14",
  color: "#f1f5f9",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  paddingBottom: 48,
};

const pageHeaderStyle: React.CSSProperties = {
  background: "#0f172a",
  borderBottom: "1px solid #1e293b",
  padding: "14px 0",
  marginBottom: 28,
};

const pageHeaderInnerStyle: React.CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: "0 24px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 12,
};

const pageTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#f1f5f9",
};

const pageSubStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#64748b",
};

const backLinkStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#94a3b8",
  textDecoration: "none",
  fontWeight: 600,
};

const tvGridStyle: React.CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: "0 24px",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: 24,
};

const screenLabelRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
};

const screenLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

const lockedTagStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#fca5a5",
  background: "#1c0a0a",
  border: "1px solid #7f1d1d",
  borderRadius: 4,
  padding: "1px 6px",
  fontWeight: 600,
};

// TV bezel
const tvFrameStyle: React.CSSProperties = {
  borderRadius: 10,
  overflow: "hidden",
  border: "2px solid #1e293b",
  background: "#000",
  boxShadow:
    "0 20px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.03)",
};

// 16:9 aspect ratio container — children must be position:absolute
const screenStyle: React.CSSProperties = {
  position: "relative",
  paddingBottom: "56.25%",
  background: [
    "radial-gradient(ellipse at 50% 0%, rgba(30,58,138,0.35) 0%, transparent 65%)",
    "linear-gradient(180deg, #0d1526 0%, #070c18 100%)",
  ].join(", "),
  overflow: "hidden",
};

const liveBadgeStyle: React.CSSProperties = {
  position: "absolute",
  top: 10,
  left: 10,
  display: "flex",
  alignItems: "center",
  gap: 5,
  background: "rgba(0,0,0,0.55)",
  border: "1px solid rgba(239,68,68,0.45)",
  borderRadius: 4,
  padding: "3px 8px",
  fontSize: 10,
  fontWeight: 800,
  color: "#fca5a5",
  letterSpacing: "0.1em",
};

const liveDotStyle: React.CSSProperties = {
  display: "inline-block",
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "#ef4444",
};

const centerMessageStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  textAlign: "center",
};

const centerMessageHeadStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#475569",
};

const centerMessageSubStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#334155",
  marginTop: 4,
};

// Lower-third bar — absolute, pinned to bottom
const lowerThirdStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  background:
    "linear-gradient(to bottom, rgba(4,8,18,0.88) 0%, rgba(4,8,18,0.97) 100%)",
};

// Coloured accent line above the lower-third body
const accentBarStyle: React.CSSProperties = {
  height: 3,
  background:
    "linear-gradient(90deg, #3b82f6 0%, #6366f1 60%, transparent 100%)",
};

const lowerThirdBodyStyle: React.CSSProperties = {
  padding: "9px 14px 8px",
};

// Row 1: game + countdown
const mainRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 6,
};

const nowPlayingTagStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.12em",
  color: "#3b82f6",
  textTransform: "uppercase",
  marginBottom: 3,
};

const gameNameStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  color: "#f1f5f9",
  letterSpacing: "-0.3px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function countdownBoxStyle(remaining: number | null): React.CSSProperties {
  const urgent = remaining !== null && remaining < 30000;
  const critical = remaining !== null && remaining < 10000;
  return {
    flexShrink: 0,
    textAlign: "right",
    background: critical
      ? "rgba(185,28,28,0.25)"
      : urgent
      ? "rgba(180,83,9,0.2)"
      : "rgba(255,255,255,0.04)",
    border: critical
      ? "1px solid rgba(239,68,68,0.4)"
      : urgent
      ? "1px solid rgba(245,158,11,0.3)"
      : "1px solid rgba(255,255,255,0.06)",
    borderRadius: 6,
    padding: "4px 10px",
  };
}

const countdownLabelStyle: React.CSSProperties = {
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: "0.1em",
  color: "#64748b",
  textTransform: "uppercase",
  marginBottom: 2,
};

function countdownValueStyle(remaining: number | null): React.CSSProperties {
  const urgent = remaining !== null && remaining < 30000;
  const critical = remaining !== null && remaining < 10000;
  return {
    fontSize: 19,
    fontWeight: 800,
    color: critical ? "#fca5a5" : urgent ? "#fbbf24" : "#f1f5f9",
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  };
}

// Row 2: up next
const upNextRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  minHeight: 16,
};

const upNextTagStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.12em",
  color: "#475569",
  textTransform: "uppercase",
  flexShrink: 0,
};

const upNextGameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#cbd5e1",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 180,
};

const upNextEmptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#334155",
  fontStyle: "italic",
};

function priorityPillStyle(p: Priority): React.CSSProperties {
  const configs: Record<
    Priority,
    { bg: string; color: string }
  > = {
    free:  { bg: "rgba(100,116,139,0.18)", color: "#94a3b8" },
    boost: { bg: "rgba(180,83,9,0.22)",    color: "#fbbf24" },
    next:  { bg: "rgba(185,28,28,0.22)",   color: "#fca5a5" },
  };
  const c = configs[p];
  return {
    fontSize: 9,
    fontWeight: 700,
    padding: "1px 5px",
    borderRadius: 3,
    background: c.bg,
    color: c.color,
    letterSpacing: "0.05em",
    flexShrink: 0,
    whiteSpace: "nowrap",
  };
}

const appBrandingStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#1e293b",
  marginLeft: "auto",
  flexShrink: 0,
  fontWeight: 500,
};

const footerStyle: React.CSSProperties = {
  maxWidth: 1200,
  margin: "28px auto 0",
  padding: "0 24px",
  fontSize: 12,
  color: "#1e293b",
  textAlign: "center",
};

const footerLinkStyle: React.CSSProperties = {
  color: "#334155",
  textDecoration: "none",
};

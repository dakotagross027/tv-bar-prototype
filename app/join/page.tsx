"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { advanceTVInDB, loadTVs } from "../../lib/db";
import { useSupabaseSync } from "../hooks/useSupabaseSync";
import { formatRemaining } from "../prototype";

export default function JoinPage() {
  const [tvs, setTvs] = useState<Awaited<ReturnType<typeof loadTVs>>>([]);
  const [tick, setTick] = useState(Date.now());
  const [loaded, setLoaded] = useState(false);

  // Always-fresh ref so the setInterval closure sees current TV state.
  const tvsRef = useRef(tvs);
  useEffect(() => { tvsRef.current = tvs; }, [tvs]);

  useEffect(() => {
    loadTVs()
      .then((data) => {
        setTvs(data);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        console.error("[BarTV] join/loadTVs failed:", err instanceof Error ? err.message : err);
        setLoaded(true);
      });
  }, []);

  // Per-second tick + advance expired slots.
  // The atomic conditional UPDATE prevents double-advance races between tabs,
  // so it's safe to run this on every page that shows a live countdown.
  useEffect(() => {
    const timer = setInterval(async () => {
      setTick(Date.now());
      const now = Date.now();
      const expired = tvsRef.current.filter(
        (tv) => tv.currentEndsAt !== null && tv.currentEndsAt <= now + 100
      );
      if (expired.length === 0) return;

      for (const tv of expired) {
        await advanceTVInDB(tv.id).catch((err) =>
          console.error(
            `[BarTV] join advance failed for ${tv.id}:`,
            err instanceof Error ? err.message : err
          )
        );
      }
      loadTVs()
        .then(setTvs)
        .catch((err) =>
          console.error("[BarTV] join post-advance refresh failed:", err instanceof Error ? err.message : err)
        );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Polling fallback: 5-second interval keeps the landing page current
  // even if realtime subscription events are missed.
  useEffect(() => {
    const poll = setInterval(() => {
      loadTVs().then(setTvs).catch(console.warn);
    }, 5_000);
    return () => clearInterval(poll);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime sync: reflects dashboard changes (locks, advances) in real time
  useSupabaseSync(setTvs);

  return (
    <main style={mainStyle}>
      <div style={containerStyle}>
        {/* Brand mark */}
        <div style={brandStyle}>
          <span style={logoStyle}>📺</span>
          <span style={brandNameStyle}>BarTV</span>
        </div>

        {/* Hero */}
        <div style={heroStyle}>
          <h1 style={headingStyle}>Request what&apos;s on the TVs</h1>
          <p style={subheadingStyle}>
            Pick your game, choose your priority, done in 30 seconds.
          </p>
        </div>

        {/* Live TV status */}
        {loaded && tvs.length > 0 && (
          <div style={tvStatusCardStyle}>
            <div style={tvStatusLabelStyle}>WHAT&apos;S PLAYING NOW</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {tvs.map((tv, i) => {
                const remaining =
                  tv.currentEndsAt ? tv.currentEndsAt - tick : null;
                const isLast = i === tvs.length - 1;
                return (
                  <div
                    key={tv.id}
                    style={tvRowStyle(isLast)}
                  >
                    <div style={tvLabelStyle}>{tv.name}</div>
                    <div style={tvGameStyle}>
                      {tv.locked ? (
                        <span style={{ color: "#475569" }}>
                          🔒 Staff managed
                        </span>
                      ) : tv.currentGame ? (
                        tv.currentGame
                      ) : (
                        <span style={{ color: "#22c55e" }}>
                          Open — be the first to request
                        </span>
                      )}
                    </div>
                    {tv.currentGame && !tv.locked && remaining !== null && (
                      <div style={tvTimerStyle}>
                        ⏱ {formatRemaining(remaining)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Primary CTA */}
        <Link href="/" style={ctaButtonStyle}>
          Request a Game →
        </Link>

        {/* Pricing tiers */}
        <div style={pricingCardStyle}>
          <div style={pricingLabelStyle}>CHOOSE YOUR PRIORITY</div>
          <div style={pricingRowStyle}>
            <div style={pricingTierStyle}>
              <div style={tierNameStyle}>Free</div>
              <div style={tierDescStyle}>Standard queue</div>
            </div>
            <div style={pricingDividerStyle} />
            <div style={pricingTierStyle}>
              <div style={{ ...tierNameStyle, color: "#f59e0b" }}>$3 Boost</div>
              <div style={tierDescStyle}>Move ahead</div>
            </div>
            <div style={pricingDividerStyle} />
            <div style={pricingTierStyle}>
              <div style={{ ...tierNameStyle, color: "#ef4444" }}>
                $10 Next Up
              </div>
              <div style={tierDescStyle}>Skip to #1</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <span style={{ color: "#1e293b" }}>
            Staff?{" "}
            <Link href="/dashboard" style={staffLinkStyle}>
              Open dashboard
            </Link>
          </span>
        </div>
      </div>
    </main>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mainStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#080e1a",
  color: "#f1f5f9",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  display: "flex",
  justifyContent: "center",
  padding: "40px 20px 48px",
};

const containerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 400,
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const brandStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 4,
};

const logoStyle: React.CSSProperties = {
  fontSize: 24,
  lineHeight: 1,
};

const brandNameStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#f1f5f9",
  letterSpacing: "-0.4px",
};

const heroStyle: React.CSSProperties = {
  marginBottom: 4,
};

const headingStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  color: "#f1f5f9",
  margin: "0 0 8px",
  letterSpacing: "-0.5px",
  lineHeight: 1.15,
};

const subheadingStyle: React.CSSProperties = {
  fontSize: 15,
  color: "#64748b",
  margin: 0,
  lineHeight: 1.5,
};

const tvStatusCardStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 16,
  padding: "16px 18px",
};

const tvStatusLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.12em",
  color: "#334155",
  textTransform: "uppercase",
  marginBottom: 12,
};

function tvRowStyle(isLast: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingBottom: isLast ? 0 : 10,
    marginBottom: isLast ? 0 : 10,
    borderBottom: isLast ? "none" : "1px solid #1e293b",
    flexWrap: "wrap",
  };
}

const tvLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  flexShrink: 0,
  width: 36,
};

const tvGameStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#e2e8f0",
  flex: 1,
  minWidth: 0,
};

const tvTimerStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  flexShrink: 0,
  fontVariantNumeric: "tabular-nums",
};

const ctaButtonStyle: React.CSSProperties = {
  display: "block",
  textAlign: "center",
  padding: "18px 24px",
  borderRadius: 16,
  background: "#2563eb",
  color: "white",
  fontWeight: 800,
  fontSize: 17,
  textDecoration: "none",
  letterSpacing: "0.01em",
};

const pricingCardStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 16,
  padding: "16px 18px",
};

const pricingLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.12em",
  color: "#334155",
  textTransform: "uppercase",
  marginBottom: 12,
};

const pricingRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
};

const pricingTierStyle: React.CSSProperties = {
  flex: 1,
  textAlign: "center",
};

const tierNameStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#f1f5f9",
  marginBottom: 3,
};

const tierDescStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#475569",
};

const pricingDividerStyle: React.CSSProperties = {
  width: 1,
  background: "#1e293b",
  margin: "0 8px",
};

const footerStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 13,
  marginTop: 4,
};

const staffLinkStyle: React.CSSProperties = {
  color: "#334155",
  textDecoration: "none",
  fontWeight: 600,
};

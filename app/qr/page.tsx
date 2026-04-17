"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

export default function QRPage() {
  // Start empty — window.location is not available during SSR/hydration.
  // The effect below sets the real origin so the QR code always encodes
  // the actual deployed URL, not a hardcoded localhost value.
  const [joinUrl, setJoinUrl] = useState("");

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/join`);
  }, []);

  return (
    <main style={mainStyle}>
      <div style={containerStyle}>
        {/* Header row */}
        <div style={headerRowStyle}>
          <div style={brandStyle}>
            <span style={{ fontSize: 20 }}>📺</span>
            <span style={brandNameStyle}>BarTV</span>
          </div>
          <Link href="/dashboard" style={backLinkStyle}>
            ← Dashboard
          </Link>
        </div>

        {/* QR card */}
        <div style={qrCardStyle}>
          <div style={scanInstructionStyle}>
            SCAN TO REQUEST WHAT&apos;S ON THE TVs
          </div>

          <div style={qrWrapperStyle}>
            {joinUrl ? (
              <QRCodeSVG
                value={joinUrl}
                size={240}
                bgColor="#f8fafc"
                fgColor="#0f172a"
                level="M"
              />
            ) : (
              <div style={{ width: 240, height: 240, background: "#e2e8f0", borderRadius: 8 }} />
            )}
          </div>

          <div style={urlLabelStyle}>
            {joinUrl || <span style={{ color: "#94a3b8" }}>Detecting URL…</span>}
          </div>

          <div style={taglineStyle}>
            Free to join &nbsp;·&nbsp; Skip the line from $3
          </div>
        </div>

        {/* Staff note */}
        <p style={staffNoteStyle}>
          Display this on a tablet at the bar, or print and place on tables.
          Guests scan and go straight to the request flow — no app download
          needed.
        </p>

        <div style={footerLinksStyle}>
          <Link href="/join" style={footerLinkStyle}>
            Preview guest view
          </Link>
          <span style={{ color: "#1e293b" }}>·</span>
          <Link href="/overlay" style={footerLinkStyle}>
            TV Overlays
          </Link>
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
  alignItems: "center",
  justifyContent: "center",
  padding: "24px 20px",
};

const containerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 460,
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 28,
};

const brandStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const brandNameStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#f1f5f9",
  letterSpacing: "-0.4px",
};

const backLinkStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#64748b",
  fontWeight: 600,
  textDecoration: "none",
};

const qrCardStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 20,
  padding: "32px 28px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 20,
  marginBottom: 20,
};

const scanInstructionStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.12em",
  color: "#64748b",
  textTransform: "uppercase",
  textAlign: "center",
};

const qrWrapperStyle: React.CSSProperties = {
  padding: 16,
  background: "#f8fafc",
  borderRadius: 16,
  lineHeight: 0,
  boxShadow: "0 0 0 1px rgba(255,255,255,0.06)",
};

const urlLabelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#475569",
  fontFamily: "monospace",
  textAlign: "center",
  wordBreak: "break-all",
};

const taglineStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#334155",
  textAlign: "center",
};

const staffNoteStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#475569",
  lineHeight: 1.6,
  textAlign: "center",
  margin: "0 0 20px",
};

const footerLinksStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 10,
  fontSize: 13,
};

const footerLinkStyle: React.CSSProperties = {
  color: "#334155",
  textDecoration: "none",
  fontWeight: 600,
};

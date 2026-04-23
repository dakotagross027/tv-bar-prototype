"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Server-side-gated staff login page.
 * On success the API sets an HttpOnly cookie; middleware then lets the
 * browser through to /dashboard on the next navigation.
 */
export default function StaffLoginPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/staff-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: value.trim() }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        router.push("/dashboard");
      } else {
        setError(data.error ?? "Incorrect passcode.");
        setValue("");
      }
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={mainStyle}>
      <div style={cardStyle}>
        <div style={brandStyle}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>📺</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.4px" }}>
              BarTV <span style={staffBadgeStyle}>STAFF</span>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Staff dashboard</div>
          </div>
        </div>

        <h1 style={headingStyle}>Enter passcode</h1>
        <p style={subStyle}>This area is restricted to bar staff.</p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="password"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(""); }}
            placeholder="Staff passcode"
            autoFocus
            style={inputStyle}
          />
          {error && <div style={errorStyle}>{error}</div>}
          <button type="submit" disabled={loading || !value.trim()} style={buttonStyle(loading || !value.trim())}>
            {loading ? "Checking…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

const mainStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#080e1a",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px 20px",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 380,
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 20,
  padding: "32px 28px",
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const brandStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
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

const headingStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: "#f1f5f9",
  margin: 0,
  letterSpacing: "-0.4px",
};

const subStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#64748b",
  margin: "-12px 0 0",
  lineHeight: 1.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 12,
  border: "1px solid #1e293b",
  background: "#080e1a",
  color: "#f1f5f9",
  fontSize: 16,
  outline: "none",
  boxSizing: "border-box",
  letterSpacing: "0.1em",
};

const errorStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#fca5a5",
  background: "#1c0a0a",
  border: "1px solid #7f1d1d",
  borderRadius: 8,
  padding: "8px 12px",
};

function buttonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "13px",
    borderRadius: 12,
    border: "none",
    background: disabled ? "#1e293b" : "#2563eb",
    color: disabled ? "#475569" : "white",
    fontWeight: 700,
    fontSize: 15,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

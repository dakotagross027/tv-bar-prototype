/**
 * HMAC-SHA256 token helpers — shared by middleware.ts and the staff-auth API route.
 *
 * Kept in a separate module so middleware.ts stays a pure Next.js middleware
 * file (only exporting `middleware` and `config`).  Importing from middleware.ts
 * in other files can prevent Vercel from recognising it as middleware.
 *
 * Uses the Web Crypto API (crypto.subtle), which is available in both the
 * Next.js Edge Runtime and Node.js 18+.
 */

const COOKIE_NAME = "bartv_staff_token";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export { COOKIE_NAME, TOKEN_TTL_MS };

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Build a signed token: `<issuedAtMs>.<hex-hmac>`
 * Returns null if STAFF_DASHBOARD_PASSCODE is not set.
 */
export async function buildToken(): Promise<string | null> {
  const secret = process.env.STAFF_DASHBOARD_PASSCODE;
  if (!secret) return null;
  const issuedAt = Date.now().toString();
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(issuedAt));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${issuedAt}.${hex}`;
}

/**
 * Verify a token produced by buildToken().
 * Returns false on any error — always fails closed.
 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    const secret = process.env.STAFF_DASHBOARD_PASSCODE;
    if (!secret) return false; // no secret → deny

    const dot = token.indexOf(".");
    if (dot === -1) return false;

    const issuedAt = parseInt(token.slice(0, dot), 10);
    if (isNaN(issuedAt)) return false;
    if (Date.now() - issuedAt > TOKEN_TTL_MS) return false;

    const hex = token.slice(dot + 1);
    if (!hex) return false;

    const key = await getKey(secret);
    const sigBytes = Uint8Array.from(
      (hex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16))
    );
    return crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(issuedAt.toString())
    );
  } catch {
    return false; // always fail closed
  }
}

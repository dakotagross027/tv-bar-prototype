import { NextResponse } from "next/server";
import { buildToken, COOKIE_NAME } from "../../../lib/token";

/**
 * POST /api/staff-auth
 *
 * Verifies the staff passcode against STAFF_DASHBOARD_PASSCODE (server-only
 * env var — never exposed to the client).
 *
 * On success, sets an HttpOnly, Secure, SameSite=Strict cookie containing a
 * signed HMAC token.  The middleware verifies this cookie on every request to
 * /dashboard before the page loads — no client-side state needed.
 *
 * Required Vercel env vars:
 *   STAFF_DASHBOARD_PASSCODE  — the staff passcode (server-only, no NEXT_PUBLIC_ prefix)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as { passcode?: unknown };
    const passcode = typeof body.passcode === "string" ? body.passcode : "";

    const correct = process.env.STAFF_DASHBOARD_PASSCODE;
    if (!correct) {
      return NextResponse.json(
        { ok: false, error: "Staff access is not configured on this server." },
        { status: 500 }
      );
    }

    if (passcode !== correct) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const token = await buildToken();
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Failed to issue session token." },
        { status: 500 }
      );
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 12 * 60 * 60, // 12 hours
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

/**
 * DELETE /api/staff-auth — sign out by clearing the HttpOnly cookie.
 * Must be done server-side; HttpOnly cookies are not accessible to JS.
 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return res;
}

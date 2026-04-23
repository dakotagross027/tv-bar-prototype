import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, verifyToken } from "./lib/token";

/**
 * Edge middleware — runs before any page or API handler on Vercel.
 *
 * Protects /dashboard by verifying an HMAC-signed HttpOnly cookie.
 * Always fails CLOSED: any missing or invalid token redirects to /staff-login.
 *
 * NOTE: this file must ONLY export `middleware` and `config`.
 * Do NOT export helper functions or import this file from other modules —
 * doing so prevents Vercel from recognising it as middleware.
 */
export const runtime = "experimental-edge";

export async function middleware(req: NextRequest) {
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/staff-login";

  function deny() {
    const res = NextResponse.redirect(loginUrl);
    res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return res;
  }

  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (token && (await verifyToken(token))) {
      return NextResponse.next();
    }
  } catch {
    // Any unexpected error (crypto unavailable, runtime fault, etc.)
    // must redirect, never allow. Fail closed unconditionally.
  }

  return deny();
}

export const config = {
  // Match /dashboard exactly AND any sub-paths.
  // Both patterns are required: /dashboard/:path* alone does not reliably
  // match the bare /dashboard URL in all Next.js/Vercel versions.
  matcher: ["/dashboard", "/dashboard/:path*"],
};

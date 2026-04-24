import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken, COOKIE_NAME } from "./lib/token";

/**
 * Next.js 16 Proxy (formerly "middleware").
 *
 * Protects /dashboard routes with HMAC-signed HttpOnly cookie auth.
 * No `export const runtime` — proxy defaults to Node.js runtime in Next.js 16,
 * and setting runtime in a proxy file throws a build error.
 */
export async function proxy(req: NextRequest) {
  const deny = () => NextResponse.redirect(new URL("/staff-login", req.url));

  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return deny();
    const valid = await verifyToken(token);
    if (!valid) return deny();
    return NextResponse.next();
  } catch {
    // Always fail closed — any unexpected error redirects to login
    return deny();
  }
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};

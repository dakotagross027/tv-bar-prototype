import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * DIAGNOSTIC MIDDLEWARE — unconditional redirect.
 *
 * Every request to /dashboard or /dashboard/* is redirected to /staff-login
 * with no token checks, no env var reads, no cookies — nothing.
 *
 * If /dashboard is still publicly accessible in production after this deploys,
 * Next.js middleware is not running at all in this Vercel project.
 *
 * Remove this file and restore auth/token.ts-based middleware once confirmed.
 */
export const runtime = "experimental-edge";

export async function middleware(_req: NextRequest) {
  return NextResponse.redirect(new URL("/staff-login", _req.url));
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};

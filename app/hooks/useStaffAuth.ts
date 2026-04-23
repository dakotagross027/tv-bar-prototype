"use client";

import { useRouter } from "next/navigation";

/**
 * Thin hook used by the dashboard to provide a sign-out action.
 *
 * Route protection is now handled entirely by middleware.ts (HMAC-signed
 * HttpOnly cookie verified at the edge before the page loads).  This hook
 * no longer needs to manage auth state — if the user reaches /dashboard,
 * middleware has already verified the cookie.
 */
export function useStaffAuth() {
  const router = useRouter();

  /**
   * Sign out: asks the server to clear the HttpOnly cookie, then redirects
   * to the login page.  The cookie cannot be cleared client-side because it
   * is HttpOnly.
   */
  async function signOut() {
    await fetch("/api/staff-auth", { method: "DELETE" }).catch(() => null);
    router.push("/staff-login");
  }

  return { signOut };
}

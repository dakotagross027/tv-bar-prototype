/**
 * GET /api/debug-env
 *
 * Temporary diagnostic route — confirms whether STAFF_DASHBOARD_PASSCODE
 * is present in the Vercel environment without exposing its value.
 *
 * Remove once env var configuration is verified in production.
 */
export async function GET() {
  const passcode = process.env.STAFF_DASHBOARD_PASSCODE;

  return Response.json({
    hasStaffPasscode: passcode !== undefined && passcode.length > 0,
    passcodeLength: passcode?.length ?? 0,
    nodeEnv: process.env.NODE_ENV,
  });
}

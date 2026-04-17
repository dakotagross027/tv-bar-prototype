import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly set the workspace root so Turbopack does not walk up to a
  // stray package-lock.json in the OS home directory (Windows-only issue).
  // process.cwd() is the project root when `next dev` / `next build` runs.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;

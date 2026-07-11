import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables the `forbidden()` / `unauthorized()` navigation helpers so
    // requirePermission() can render a real 403 page.
    authInterrupts: true,
  },
};

export default nextConfig;

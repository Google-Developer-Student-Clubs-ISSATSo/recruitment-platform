import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy, assembled per directive so the intent of each line is
// legible. Scoped to what this app actually loads: everything is same-origin,
// images may also be inline data URIs or hosted https (avatars / email art),
// and styles are inline because Tailwind and Base UI inject them.
//
// script-src keeps 'unsafe-inline' because Next's App Router streams inline
// bootstrap/hydration scripts; locking that down properly means a per-request
// nonce set from middleware, which is a deliberate follow-up, not a quiet config
// change. In dev we additionally allow 'unsafe-eval' and ws: — Turbopack's HMR
// needs both — and neither is emitted in a production build.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: https:`,
  `font-src 'self' data:`,
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Belt-and-braces with frame-ancestors above, for older agents.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Ignored by browsers over plain HTTP, so it's inert in local dev and only
  // takes effect once the app is served over HTTPS in deployment.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // This app uses none of these device APIs — deny them outright.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    // Enables the `forbidden()` / `unauthorized()` navigation helpers so
    // requirePermission() can render a real 403 page.
    authInterrupts: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

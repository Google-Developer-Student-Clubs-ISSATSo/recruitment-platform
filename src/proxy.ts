import { NextResponse, type NextRequest } from "next/server";

/**
 * Auth.js session cookie, in both the forms it can take: the `__Secure-` prefix
 * is used over HTTPS (production), the bare name over plain HTTP (local dev).
 */
const SESSION_COOKIES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
];

/**
 * Fast signed-out redirect.
 *
 * This deliberately checks only for the PRESENCE of a session cookie and never
 * touches the database. Sessions use the database strategy, so wrapping this in
 * Auth.js's `auth()` — as it previously was — meant a full session+user query on
 * every single matched request, before the page had even started rendering.
 *
 * Presence of a cookie is not proof of a valid session, and it is not treated as
 * such: every protected route still validates authoritatively on the server. The
 * (app) and /admin layouts call `getShellUser()`, and each page calls
 * `requirePermission()` — both read the real session and redirect to /login when
 * it is missing, expired, or revoked. A stale or forged cookie therefore gets
 * past this check and is rejected a moment later by the real one; nothing is
 * authorised here.
 *
 * What this DOES buy is skipping a wasted round trip for the common case, while
 * still bouncing obviously-signed-out visitors without rendering anything.
 *
 * Note the "already signed in → leave /login" redirect is NOT done here any
 * more: deciding that from a cookie alone would bounce a user holding a stale
 * cookie between /login and / forever. It lives on the login page itself, where
 * the session can actually be verified.
 */
export default function proxy(req: NextRequest) {
  const { pathname, origin } = req.nextUrl;

  // Login is the only page reachable while signed out.
  if (pathname === "/login") return NextResponse.next();

  const hasSessionCookie = SESSION_COOKIES.some((name) =>
    req.cookies.has(name),
  );
  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  return NextResponse.next();
}

export const config = {
  // Skip NextAuth API routes and static assets; everything else runs the proxy.
  // The trailing `.*\\..*` also excludes any path with a file extension (e.g.
  // /LOGO.png and other files in /public) so the auth gate never redirects a
  // static asset — otherwise next/image's optimizer fetches a redirect instead
  // of the image and fails with a 400.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

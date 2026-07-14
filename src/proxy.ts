import { NextResponse } from "next/server";

import { auth } from "@/auth";

export default auth((req) => {
  const { pathname, origin } = req.nextUrl;
  const isAuthenticated = Boolean(req.auth);
  const isLoginPage = pathname === "/login";
  // The invite accept flow must be reachable while signed out.
  const isPublicPage = isLoginPage || pathname.startsWith("/invite");

  // Already signed in and sitting on the login page → send them to the app.
  if (isAuthenticated && isLoginPage) {
    return NextResponse.redirect(new URL("/", origin));
  }

  // Signed out and trying to reach a protected route → send them to login.
  if (!isAuthenticated && !isPublicPage) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  return NextResponse.next();
});

export const config = {
  // Skip NextAuth API routes and static assets; everything else runs the proxy.
  // The trailing `.*\\..*` also excludes any path with a file extension (e.g.
  // /LOGO.png and other files in /public) so the auth gate never redirects a
  // static asset — otherwise next/image's optimizer fetches a redirect instead
  // of the image and fails with a 400.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

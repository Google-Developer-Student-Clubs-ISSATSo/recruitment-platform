import { NextResponse } from "next/server";

import { auth } from "@/auth";

export default auth((req) => {
  const { pathname, origin } = req.nextUrl;
  const isAuthenticated = Boolean(req.auth);
  const isLoginPage = pathname === "/login";

  // Already signed in and sitting on the login page → send them to the app.
  if (isAuthenticated && isLoginPage) {
    return NextResponse.redirect(new URL("/", origin));
  }

  // Signed out and trying to reach a protected route → send them to login.
  if (!isAuthenticated && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  return NextResponse.next();
});

export const config = {
  // Skip NextAuth API routes and static assets; everything else runs the proxy.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};

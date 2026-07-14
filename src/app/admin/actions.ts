"use server";

import { signOut } from "@/auth";

// Mirror of how `signIn` is wired for login (a Server Action wrapping the
// auth.ts helper): with the "database" session strategy, calling signOut on
// the server deletes the Session row, clears the cookie, then redirects.
export async function logout() {
  await signOut({ redirectTo: "/login" });
}

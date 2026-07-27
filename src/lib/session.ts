import { cache } from "react";

import { auth } from "@/auth";

/**
 * The current session, deduplicated per request.
 *
 * Sessions use the database strategy, so every `auth()` call is a real query
 * (session row + its user). A single page render reaches for the session
 * several times over — the layout's shell, the page's `requirePermission`, and
 * every `<PermissionGate>` — and `auth()` does NOT dedupe those on its own, so
 * each one was its own round trip to Neon.
 *
 * React's `cache()` scopes to one request, which is exactly the lifetime a
 * session lookup should have: still re-read on the next request (so revoking a
 * session server-side stays immediate — the whole reason this app uses database
 * sessions), but read only once while rendering a single page.
 *
 * Use this anywhere the current session is being READ. `auth()` itself stays
 * the right call inside the Auth.js route handler and the proxy.
 */
export const getSession = cache(async () => auth());

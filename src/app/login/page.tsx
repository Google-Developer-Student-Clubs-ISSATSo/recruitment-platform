import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

// Sending an already-signed-in visitor into the app used to be the proxy's job,
// but the proxy no longer reads the session from the database (see proxy.ts).
// The check lives here instead, where the session is actually verified — doing
// it from cookie presence alone would trap anyone holding a stale cookie in a
// /login ↔ / redirect loop. This costs one session lookup, on one page.
export default async function LoginPage() {
  const session = await getSession();
  if (session?.user?.id) redirect("/");

  return <LoginForm />;
}

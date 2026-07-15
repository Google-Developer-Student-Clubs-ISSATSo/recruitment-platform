import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";

// Post-login entry point. Auth.js sends users here after a successful magic-link
// sign-in (and the proxy sends authenticated users off /login here too). Route
// them by role: MANAGE_ACCOUNTS holders go to the admin permissions screen,
// everyone else lands on their member dashboard.
export default async function Home() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  if (await hasPermission(userId, PermissionKey.MANAGE_ACCOUNTS)) {
    redirect("/admin/permissions");
  }
  redirect("/dashboard");
}

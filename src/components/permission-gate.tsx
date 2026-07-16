import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import type { PermissionKey } from "@/generated/prisma/enums";

/**
 * Renders its children only if the current user holds `permission`.
 *
 * Intentionally different from `requirePermission`: it never redirects or
 * throws — it just renders-or-doesn't. Use it for one section among several on
 * a shared page (e.g. the /configuration page). To gate an entire page, use
 * `requirePermission` at the top of the page instead.
 */
export async function PermissionGate({
  permission,
  children,
}: {
  permission: PermissionKey;
  children: React.ReactNode;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const allowed = await hasPermission(userId, permission);
  return allowed ? <>{children}</> : null;
}

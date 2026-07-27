import { getSession } from "@/lib/session";
import { hasAnyPermission } from "@/lib/permissions";
import { pageAccessKeys } from "@/lib/route-permissions";
import type { PermissionKey } from "@/generated/prisma/enums";

/**
 * Renders its children only if the current user holds `permission` — or, when
 * given an array, *any* of them. The array form uses the same "any of these
 * grants access" convention as CAMPAIGN_PAGE_PERMISSIONS and is normalized
 * through the same {@link pageAccessKeys}, so a section gated on two
 * permissions can't read differently here than the same pair does in a route
 * guard or the sidebar.
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
  permission: PermissionKey | readonly PermissionKey[];
  children: React.ReactNode;
}) {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return null;

  const allowed = await hasAnyPermission(userId, pageAccessKeys(permission));
  return allowed ? <>{children}</> : null;
}

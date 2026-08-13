import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getEffectivePermissions } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import { getLeadRolesForUser } from "@/lib/identity-color-store";
import { resolveIdentityColor, type IdentityColor } from "@/lib/identity-color";
import { resolvePrimaryRole } from "@/lib/primary-role";
import { ROLE_TEMPLATE_LABELS } from "@/app/admin/permissions/permission-config";

export type ShellUser = {
  userId: string;
  userName: string;
  userSubtitle: string;
  /**
   * Colour for the sidebar avatar. The shell spans every page, including ones
   * with no campaign in scope, so lead titles are resolved across OPEN
   * campaigns — see getLeadRolesForUser.
   */
  identityColor: IdentityColor;
  /** Holder of MANAGE_ACCOUNTS — gates admin-only shell controls. */
  canManageAccounts: boolean;
  /**
   * Every permission this user holds, so the sidebar can render only the nav
   * links they can actually reach (checked against the route-permission maps).
   */
  permissions: PermissionKey[];
};

// Identity + display data for the app shell, shared by every authenticated
// layout so the sidebar/top bar are built the same way everywhere. Redirects
// to /login if there is no session (defense-in-depth alongside the proxy).
export async function getShellUser(): Promise<ShellUser> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      committee: true,
      roleTemplate: { select: { name: true } },
    },
  });

  // Effective, not raw: a capped Club Lead's stored TM_REVIEWER rows must not
  // resurface here, or the sidebar would offer links hasPermission then
  // denies at the route (see CLUB_LEAD_CAPPED_PERMISSIONS in lib/permissions).
  const permissions = await getEffectivePermissions(userId);
  const canManageAccounts = permissions.includes(PermissionKey.MANAGE_ACCOUNTS);
  const templateLabel = user?.roleTemplate
    ? ROLE_TEMPLATE_LABELS[user.roleTemplate.name]
    : "Member";

  const leadRoles = user ? await getLeadRolesForUser(userId) : [];
  const primaryRoleLabel = user
    ? resolvePrimaryRole({ templateLabel, leadRoles }).label
    : "Member";

  return {
    userId,
    userName: user?.name ?? "Member",
    userSubtitle: user ? `${primaryRoleLabel} · ${user.committee}` : "Member",
    identityColor: user
      ? resolveIdentityColor({ committee: user.committee, leadRoles })
      : "committee-tm",
    canManageAccounts,
    permissions,
  };
}

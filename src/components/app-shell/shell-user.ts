import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PermissionKey } from "@/generated/prisma/enums";
import { ROLE_TEMPLATE_LABELS } from "@/app/admin/permissions/permission-config";

export type ShellUser = {
  userId: string;
  userName: string;
  userSubtitle: string;
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
      permissions: { select: { permission: true } },
      roleTemplate: { select: { name: true } },
    },
  });

  const permissions = user?.permissions.map((p) => p.permission) ?? [];
  const canManageAccounts = permissions.includes(PermissionKey.MANAGE_ACCOUNTS);
  const templateLabel = user?.roleTemplate
    ? ROLE_TEMPLATE_LABELS[user.roleTemplate.name]
    : "Member";

  return {
    userId,
    userName: user?.name ?? "Member",
    userSubtitle: user ? `${templateLabel} · ${user.committee}` : "Member",
    canManageAccounts,
    permissions,
  };
}

import { requirePermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import { AppShell } from "@/components/app-shell/app-shell";
import { getShellUser } from "@/components/app-shell/shell-user";

// Single guard for every /admin/* route. Non-admins are redirected to
// /campaigns with a clear message (see the campaign list's "denied" banner)
// rather than shown a raw 403. Individual admin pages no longer repeat this
// check.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Non-admins are redirected to /campaigns with the access-denied banner —
  // the shared default in requirePermission, so /admin behaves like every
  // other guarded route.
  await requirePermission(PermissionKey.MANAGE_ACCOUNTS);

  const shell = await getShellUser();

  return (
    <AppShell
      userName={shell.userName}
      userSubtitle={shell.userSubtitle}
      canManageAccounts={shell.canManageAccounts}
      permissions={shell.permissions}
    >
      {children}
    </AppShell>
  );
}

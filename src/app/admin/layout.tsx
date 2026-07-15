import { requirePermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import { AppShell } from "@/components/app-shell/app-shell";
import { getShellUser } from "@/components/app-shell/shell-user";

// Single guard for every /admin/* route. Non-admins are redirected to
// /dashboard with a clear message (see the dashboard's "denied" banner) rather
// than shown a raw 403. Individual admin pages no longer repeat this check.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermission(PermissionKey.MANAGE_ACCOUNTS, {
    redirectTo: "/dashboard?denied=1",
  });

  const shell = await getShellUser();

  return (
    <AppShell
      userName={shell.userName}
      userSubtitle={shell.userSubtitle}
      canManageAccounts={shell.canManageAccounts}
    >
      {children}
    </AppShell>
  );
}

import { AppShell } from "@/components/app-shell/app-shell";
import { getShellUser } from "@/components/app-shell/shell-user";

// Shell layout for the member-facing routes (/campaigns, the campaign-scoped
// pages under /campaigns/[campaignId]/…, and /activity-log). Any signed-in user
// may reach these; the shell hides admin-only controls unless they hold
// MANAGE_ACCOUNTS. The proxy already redirects signed-out users to /login, and
// getShellUser re-checks as defense-in-depth.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

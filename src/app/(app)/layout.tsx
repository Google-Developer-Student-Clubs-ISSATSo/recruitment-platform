import { AppShell } from "@/components/app-shell/app-shell";
import { getShellUser } from "@/components/app-shell/shell-user";
import { SeatApprovalPrompt } from "@/components/seat-approval/seat-approval-prompt";

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
      identityColor={shell.identityColor}
      canManageAccounts={shell.canManageAccounts}
      permissions={shell.permissions}
    >
      {children}
      {/* A panel seat request has no email behind it — it finds its approver
          here, wherever in the app they happen to be. Renders nothing at all
          unless one is actually waiting on this user. */}
      <SeatApprovalPrompt />
    </AppShell>
  );
}

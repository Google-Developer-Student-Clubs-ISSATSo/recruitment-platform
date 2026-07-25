import type { PermissionKey } from "@/generated/prisma/enums";
import { AppShellChrome } from "./app-shell-chrome";
import { NotificationBell } from "./notification-bell";

// Shared authenticated app shell (sidebar + top bar) for every signed-in page —
// both /admin/* and the member routes (/dashboard, /applicants, …). Rendered by
// the route-group layouts, which supply the current user's identity. The nav
// links are live and highlight the active route; the account controls in the
// sidebar footer (transfer + logout) are gated on MANAGE_ACCOUNTS.
//
// This half stays a SERVER component so it can render the async,
// permission-gated <NotificationBell> and pass it down as a slot. The layout
// itself — including the below-768px navigation drawer — lives in
// <AppShellChrome>, which needs a client boundary for the drawer's open state.
export function AppShell({
  userName,
  userSubtitle,
  canManageAccounts = false,
  permissions,
  children,
}: {
  userName: string;
  userSubtitle: string;
  /** Whether to show admin-only controls (Admin Settings + Transfer Admin Role). */
  canManageAccounts?: boolean;
  /** The current user's permissions — the sidebar filters nav links against these. */
  permissions: PermissionKey[];
  children: React.ReactNode;
}) {
  return (
    // Both Google Fonts <link>s that used to live here are gone, along with the
    // .material-symbols-outlined base rule.
    //
    // Neither could ever load: this app's CSP (next.config.ts) sets
    // `style-src 'self' 'unsafe-inline'` and `font-src 'self' data:`, so the
    // stylesheets from fonts.googleapis.com were blocked outright and the font
    // files from fonts.gstatic.com would have been too. The Material Symbols link
    // is now unnecessary because <Icon> renders lucide SVGs. The Inter link was
    // equally dead — the shell's `fontFamily: "Inter, …"` has always been falling
    // through to the self-hosted next/font Geist, which is what the app actually
    // renders in and what these pages were designed against.
    <AppShellChrome
      userName={userName}
      userSubtitle={userSubtitle}
      canManageAccounts={canManageAccounts}
      permissions={permissions}
      notificationBell={<NotificationBell />}
    >
      {children}
    </AppShellChrome>
  );
}

import Link from "next/link";

import type { PermissionKey } from "@/generated/prisma/enums";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Logo } from "@/components/logo";
import { Icon } from "./icon";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notification-bell";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";

// Shared authenticated app shell (sidebar + top bar) for every signed-in page —
// both /admin/* and the member routes (/dashboard, /applicants, …). Rendered by
// the route-group layouts, which supply the current user's identity. The nav
// links are live and highlight the active route; the account controls in the
// sidebar footer (transfer + logout) are gated on MANAGE_ACCOUNTS.
function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

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
    <div
      className="min-h-screen bg-neutral-50 text-foreground dark:bg-neutral-950"
      style={{ fontFamily: "Inter, var(--font-sans), sans-serif" }}
    >
      {/* Design fonts (external is fine on an app route). */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
      />
      <style>{`.material-symbols-outlined{font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24;line-height:1;vertical-align:middle;}`}</style>

      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-3 p-6">
          <Logo className="h-9 w-9 rounded-lg" alt="GDGC ISSATSO" />
          <div>
            <h1 className="text-lg font-bold text-foreground">GDGC ISSATSO</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Recruitment Platform
            </p>
          </div>
        </div>

        <SidebarNav permissions={permissions} />

        {/* Account section: identity, then Transfer Admin Role (MANAGE_ACCOUNTS
            only), directly above Log Out. */}
        <div className="mt-auto space-y-1 border-t border-neutral-200 p-3 dark:border-neutral-800">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar>
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {initials(userName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">
                {userName}
              </p>
              <p className="truncate text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {userSubtitle}
              </p>
            </div>
          </div>

          {canManageAccounts && (
            <Link
              href="/admin/transfer-admin"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              <Icon name="admin_panel_settings" className="text-[20px]" />
              <span>Transfer Admin Role</span>
            </Link>
          )}

          <LogoutButton />
        </div>
      </aside>

      {/* Top bar */}
      <header className="fixed left-64 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-6">
          <h2 className="text-lg font-bold text-primary">
            Recruitment Platform
          </h2>
        </div>
        <div className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
          <ThemeToggle />
          <NotificationBell />
        </div>
      </header>

      {/* Main content */}
      <main className="ml-64 pt-16">
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

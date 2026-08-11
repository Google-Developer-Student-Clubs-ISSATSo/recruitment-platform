"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { PermissionKey } from "@/generated/prisma/enums";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/initials";
import type { IdentityColor } from "@/lib/identity-color";
import { IDENTITY_TINT_CLASS } from "@/lib/identity-color";
import { Logo } from "@/components/logo";
import { Icon } from "./icon";
import { LogoutButton } from "./logout-button";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";

// The shell's layout + the one piece of state it needs: whether the mobile
// navigation drawer is open. Split out of <AppShell> because that stays a server
// component (it renders the async <NotificationBell>, which does its own auth
// and DB work) while the drawer needs a client boundary.
//
// RESPONSIVE MODEL — one sidebar element, two behaviours, decided entirely in
// CSS at the `md` (768px) breakpoint:
//   - md and up: a permanent fixed column, exactly as before. `open` is ignored,
//     so desktop cannot be affected by drawer state at all.
//   - below md: the same column slid off-canvas, revealed over a dismissible
//     backdrop by the top bar's hamburger.
//
// There is deliberately only ONE copy of the sidebar markup. Rendering a
// separate mobile menu would mean maintaining the nav, the identity block and
// the permission-gated account controls twice, and the two would drift.
export function AppShellChrome({
  userName,
  userSubtitle,
  identityColor,
  canManageAccounts,
  permissions,
  notificationBell,
  children,
}: {
  userName: string;
  userSubtitle: string;
  /** Committee/lead colour for the identity avatar — see lib/identity-color.ts. */
  identityColor: IdentityColor;
  canManageAccounts: boolean;
  permissions: PermissionKey[];
  /** Server-rendered slot — <NotificationBell> is async and permission-gated. */
  notificationBell: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Everything that should hold only while the drawer is open, in one effect:
  //   - Escape closes it, the usual dismissal for an overlay.
  //   - Crossing up to desktop closes it, so the state can't be left stale
  //     behind the now-permanent sidebar (and the scroll lock below can't leak).
  //   - The page behind stops scrolling, which on a phone is the difference
  //     between a drawer and a floating panel over a moving background.
  // Keyed on `open`, and `open` can only become true from the md:hidden
  // hamburger — so none of this is ever installed on desktop.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const desktop = window.matchMedia("(min-width: 768px)");
    const onBreakpoint = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onBreakpoint);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onBreakpoint);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div
      className="min-h-screen bg-neutral-50 text-foreground dark:bg-neutral-950"
      style={{ fontFamily: "Inter, var(--font-sans), sans-serif" }}
    >
      {/* Backdrop — mobile only, and only while open. Tapping it closes the
          drawer. aria-hidden because the same dismissal is on Escape and on the
          drawer's own close button, both of which are reachable. */}
      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 supports-backdrop-filter:backdrop-blur-xs motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 md:hidden"
        />
      )}

      {/* Sidebar / drawer.
          `invisible` when closed rather than only translated off-screen: a
          purely transformed sidebar is still in the tab order, so a keyboard
          user on a phone would tab into links they cannot see. `md:visible`
          restores it unconditionally on desktop, so the permanent column is
          never affected. Visibility is in the transition list so it holds until
          the slide-out finishes. */}
      <aside
        id="app-sidebar"
        aria-label="Main navigation"
        // h-dvh, not h-screen: 100vh doesn't account for a mobile browser's
        // collapsing address/toolbar chrome, so a fixed h-screen sidebar can
        // extend past the real visible viewport — clipping the account
        // section (Transfer Admin Role, Log Out) below the fold on phones.
        // Same fix already used for the alert dialog's max-height.
        className={`fixed left-0 top-0 z-50 flex h-dvh w-64 flex-col border-r border-neutral-200 bg-white transition-[transform,visibility] duration-300 ease-out motion-reduce:transition-none md:visible md:translate-x-0 dark:border-neutral-800 dark:bg-neutral-900 ${
          open ? "visible translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 p-6">
          <Logo className="h-9 w-9 rounded-lg" alt="GDGC ISSATSO" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-foreground">
              GDGC ISSATSO
            </h1>
            <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">
              Recruitment Platform
            </p>
          </div>
          {/* Closing control inside the drawer itself — the hamburger is behind
              the backdrop once open, so the drawer needs its own way out. */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="-mr-2 ml-auto flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-foreground md:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <Icon name="close" className="text-[22px]" />
          </button>
        </div>

        {/* Scrolls independently: the nav can outgrow a short mobile viewport
            once a full-permission user is inside a campaign, and the identity
            and log-out controls below must stay reachable. */}
        <div className="flex-1 overflow-y-auto">
          <SidebarNav
            permissions={permissions}
            onNavigate={() => setOpen(false)}
          />
        </div>

        {/* Account section: identity, then Transfer Admin Role (MANAGE_ACCOUNTS
            only), directly above Log Out. */}
        <div className="space-y-1 border-t border-neutral-200 p-3 dark:border-neutral-800">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar>
              <AvatarFallback
                className={`text-xs font-semibold ${IDENTITY_TINT_CLASS[identityColor]}`}
              >
                {initialsOf(userName)}
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
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              <Icon name="admin_panel_settings" className="text-[20px]" />
              <span>Transfer Admin Role</span>
            </Link>
          )}

          <LogoutButton />
        </div>
      </aside>

      {/* Top bar. Spans the full width below md (no sidebar to sit beside) and
          insets by the sidebar above it. */}
      <header className="fixed left-0 right-0 top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-neutral-200 bg-white px-4 md:left-64 md:px-6 dark:border-neutral-800 dark:bg-neutral-900">
        {/* min-w-0 lets the title truncate instead of pushing the controls off
            the right edge at 375px. */}
        <div className="flex min-w-0 items-center gap-2 md:gap-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="app-sidebar"
            className="-ml-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-primary md:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <Icon name="menu" className="text-[24px]" />
          </button>

          {/* The brand lives in the sidebar on desktop; below md the sidebar is
              off-canvas, so the mark is repeated here to keep it on screen. */}
          <Logo className="h-8 w-8 shrink-0 rounded-lg md:hidden" alt="GDGC ISSATSO" />

          <h2 className="truncate text-base font-bold text-primary md:text-lg">
            Recruitment Platform
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-neutral-500 dark:text-neutral-400">
          <ThemeToggle />
          {notificationBell}
        </div>
      </header>

      {/* Main content */}
      <main className="pt-16 md:ml-64">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

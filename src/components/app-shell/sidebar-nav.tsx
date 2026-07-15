"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "./icon";

// The main navigation. Each item points at a real route (stub pages exist for
// all of them) so navigation can be verified end-to-end. Active state is
// derived from the current pathname, which is why this is a Client Component.
const NAV: { icon: string; label: string; href: string }[] = [
  { icon: "dashboard", label: "Dashboard", href: "/dashboard" },
  { icon: "group", label: "Applicants", href: "/applicants" },
  { icon: "fact_check", label: "Phase 1 Screening", href: "/phase1" },
  { icon: "video_chat", label: "Interviews", href: "/interviews" },
  { icon: "emoji_events", label: "Final Decision", href: "/final-decision" },
  { icon: "bar_chart", label: "Statistics", href: "/statistics" },
];

// Admin Settings is only shown to holders of MANAGE_ACCOUNTS.
const ADMIN_ITEM = {
  icon: "settings",
  label: "Admin Settings",
  href: "/admin/permissions",
};

export function SidebarNav({
  canManageAccounts,
}: {
  canManageAccounts: boolean;
}) {
  const pathname = usePathname();
  const items = canManageAccounts ? [...NAV, ADMIN_ITEM] : NAV;

  function isActive(href: string) {
    // Admin Settings stays highlighted across all /admin/* pages; the others
    // match their own path (and any nested routes they may later gain).
    if (href === ADMIN_ITEM.href) return pathname.startsWith("/admin");
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="flex-1 space-y-1 px-3">
      {items.map((n) => {
        const active = isActive(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={
              active
                ? "flex items-center gap-3 rounded-lg border-l-4 border-primary bg-primary/10 px-3 py-2.5 text-sm font-bold text-primary"
                : "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            }
          >
            <Icon name={n.icon} className="text-[20px]" />
            <span>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

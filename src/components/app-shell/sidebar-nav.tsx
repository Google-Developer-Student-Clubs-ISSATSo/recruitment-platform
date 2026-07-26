"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PermissionKey } from "@/generated/prisma/enums";
import {
  CAMPAIGN_PAGE_PERMISSIONS,
  CONFIGURATION_PERMISSIONS,
  PLATFORM_PAGE_PERMISSIONS,
  pageAccessKeys,
} from "@/lib/route-permissions";
import { Icon, type IconName } from "./icon";

// The main navigation. Links are rendered only when the current user holds the
// permission that gates their target, so a link never appears for a page the
// user would just be bounced off of.
//
// The nav has three tiers:
//   1. Campaigns — always shown, so users can get back to the campaign list.
//   2. Campaign-scoped items (Dashboard, Applicants, …) — shown only while the
//      user is INSIDE a campaign (a campaignId is present in the URL), with
//      hrefs built from that campaignId. Gating comes from
//      CAMPAIGN_PAGE_PERMISSIONS (the same source the route guards use).
//   3. Platform-wide items (Activity Log, Admin Settings) — shown regardless of
//      campaign context, gated by their own permission.

/**
 * A rendered nav entry. Module-scope (rather than local to the component) so the
 * standalone items below can be annotated with it — otherwise TypeScript widens
 * their `icon` to `string` and they no longer satisfy <Icon>'s IconName union.
 */
type NavItem = { icon: IconName; label: string; href: string };

// Campaign-scoped items, keyed by the sub-path under /campaigns/[id]/. A null
// permission means "always visible once inside a campaign" (the dashboard).
const CAMPAIGN_NAV: {
  icon: IconName;
  label: string;
  segment: string;
  // A single key, or "any of these grants access" (Phase 1 uses the array form).
  permission: PermissionKey | readonly PermissionKey[] | null;
}[] = [
  { icon: "dashboard", label: "Dashboard", segment: "dashboard", permission: null },
  {
    icon: "group",
    label: "Applicants",
    segment: "applicants",
    permission: CAMPAIGN_PAGE_PERMISSIONS["applicants"],
  },
  {
    icon: "fact_check",
    label: "Phase 1 Screening",
    segment: "phase1",
    permission: CAMPAIGN_PAGE_PERMISSIONS["phase1"],
  },
  {
    icon: "trophy",
    label: "Phase 1 Selection",
    segment: "phase1/selection",
    permission: CAMPAIGN_PAGE_PERMISSIONS["phase1/selection"],
  },
  {
    icon: "video_chat",
    label: "Interviews",
    segment: "interviews",
    permission: CAMPAIGN_PAGE_PERMISSIONS["interviews"],
  },
  {
    icon: "emoji_events",
    label: "Final Decision",
    segment: "final-decision",
    permission: CAMPAIGN_PAGE_PERMISSIONS["final-decision"],
  },
  {
    icon: "bar_chart",
    label: "Statistics",
    segment: "statistics",
    // Open to every member — no gate on the page, so no gate on the link.
    permission: null,
  },
];

const CAMPAIGNS_ITEM: NavItem = {
  icon: "campaign",
  label: "Campaigns",
  href: "/campaigns",
};

// Configuration is shown to anyone holding at least one configuration-related
// permission (MANAGE_CAPACITY or CONFIGURE_SCREENING), and only inside a
// campaign — its sections are per-campaign.
const CONFIG_SEGMENT = "configuration";

// Activity Log is a platform-wide page gated by VIEW_ACTIVITY_LOG.
const ACTIVITY_LOG_ITEM: NavItem = {
  icon: "receipt_long",
  label: "Activity Log",
  href: "/activity-log",
};

// Admin Settings is only shown to holders of MANAGE_ACCOUNTS.
const ADMIN_ITEM: NavItem = {
  icon: "settings",
  label: "Admin Settings",
  href: "/admin/permissions",
};

/** Extract the campaignId from a /campaigns/[id]/… path, else null. */
function campaignIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/campaigns\/([^/]+)(?:\/|$)/);
  return match ? match[1] : null;
}

export function SidebarNav({
  permissions,
  onNavigate,
}: {
  permissions: PermissionKey[];
  /**
   * Called when a nav link is activated. The shell uses it to dismiss the
   * below-768px drawer, which would otherwise stay open over the page it just
   * navigated to. Fired on click rather than watched via a pathname effect so
   * it also closes when the target is the current route.
   */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const held = new Set(permissions);
  const campaignId = campaignIdFromPath(pathname);

  const items: NavItem[] = [CAMPAIGNS_ITEM];

  // Campaign-scoped links only make sense while inside a campaign.
  if (campaignId) {
    for (const n of CAMPAIGN_NAV) {
      const allowed =
        !n.permission || pageAccessKeys(n.permission).some((k) => held.has(k));
      if (allowed) {
        items.push({
          icon: n.icon,
          label: n.label,
          href: `/campaigns/${campaignId}/${n.segment}`,
        });
      }
    }
    if (CONFIGURATION_PERMISSIONS.some((p) => held.has(p))) {
      items.push({
        icon: "tune",
        label: "Configuration",
        href: `/campaigns/${campaignId}/${CONFIG_SEGMENT}`,
      });
    }
  }

  // Platform-wide items — always available (gated by permission), independent
  // of campaign context.
  if (held.has(PLATFORM_PAGE_PERMISSIONS["/activity-log"])) {
    items.push(ACTIVITY_LOG_ITEM);
  }
  if (held.has(PermissionKey.MANAGE_ACCOUNTS)) {
    items.push(ADMIN_ITEM);
  }

  function matches(href: string) {
    // Admin Settings stays highlighted across all /admin/* pages.
    if (href === ADMIN_ITEM.href) return pathname.startsWith("/admin");
    // The Campaigns list is active only on the list itself, not when inside a
    // campaign (the campaign-scoped items own that highlight).
    if (href === CAMPAIGNS_ITEM.href) return pathname === "/campaigns";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  // Only the most specific matching link highlights. Some hrefs are prefixes of
  // others (/phase1 vs. /phase1/selection), and a plain prefix test would light
  // up both, so the longest match wins.
  const activeHref = items
    .map((n) => n.href)
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav className="flex-1 space-y-1 px-3">
      {items.map((n) => {
        const active = n.href === activeHref;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
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

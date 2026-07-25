import Link from "next/link";

import { Icon, type IconName } from "@/components/app-shell/icon";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";
import { getUserPermissions } from "@/lib/permissions";
import type { PermissionKey } from "@/generated/prisma/enums";
import {
  CAMPAIGN_PAGE_PERMISSIONS,
  CONFIGURATION_PERMISSIONS,
  PLATFORM_PAGE_PERMISSIONS,
  pageAccessKeys,
} from "@/lib/route-permissions";

// Jump-off points to the rest of the campaign, filtered to what the reader can
// actually open.
//
// The gating permissions are READ FROM the existing route-permission mapping —
// the same object the pages' `requirePermission` guards and the sidebar read.
// They are not restated here, so a card can never offer a page that would
// bounce the reader straight back to this dashboard with ?denied=1.

type QuickLink = {
  /** Path under /campaigns/[campaignId]/, or an absolute platform-wide path. */
  href: string;
  label: string;
  description: string;
  icon: IconName;
  /** A single key, or "any of these grants access". */
  permission: PermissionKey | readonly PermissionKey[];
  /** Marks a destination that lives outside the campaign. */
  platformWide?: boolean;
};

const CAMPAIGN_LINKS: Omit<QuickLink, "platformWide">[] = [
  {
    href: "applicants",
    label: "Applicants",
    description: "Browse and filter the full applicant pool.",
    icon: "group",
    permission: CAMPAIGN_PAGE_PERMISSIONS["applicants"],
  },
  {
    href: "phase1",
    label: "Phase 1 Screening",
    description: "Score applications against the form questions.",
    icon: "fact_check",
    permission: CAMPAIGN_PAGE_PERMISSIONS["phase1"],
  },
  {
    href: "interviews",
    label: "Interviews",
    description: "Booking emails, slots, and the panel board.",
    icon: "video_chat",
    permission: CAMPAIGN_PAGE_PERMISSIONS["interviews"],
  },
  {
    href: "final-decision",
    label: "Final Decision",
    description: "The live decision dashboard and shortlist pool.",
    icon: "emoji_events",
    permission: CAMPAIGN_PAGE_PERMISSIONS["final-decision"],
  },
  {
    href: "statistics",
    label: "Statistics",
    description: "Campaign-wide recruitment numbers.",
    icon: "bar_chart",
    permission: CAMPAIGN_PAGE_PERMISSIONS["statistics"],
  },
  {
    href: "configuration",
    label: "Configuration",
    description: "Capacity targets, scoring, and email links.",
    icon: "tune",
    // Configuration composes independently-gated sections; holding any one of
    // them means there is something on the page for you.
    permission: CONFIGURATION_PERMISSIONS,
  },
];

const ACTIVITY_LOG_LINK: QuickLink = {
  href: "/activity-log",
  label: "Activity Log",
  description: "Every recorded action, across all campaigns.",
  icon: "receipt_long",
  permission: PLATFORM_PAGE_PERMISSIONS["/activity-log"],
  // The audit log is deliberately NOT campaign-filtered — it is a
  // platform-wide record, so the card says so rather than implying the entries
  // it shows belong to this campaign.
  platformWide: true,
};

export async function QuickLinksGrid({
  campaignId,
  userId,
}: {
  campaignId: string;
  userId: string;
}) {
  const held = new Set(
    (await getUserPermissions(userId)).map((p) => p.permission),
  );

  const links: QuickLink[] = [
    ...CAMPAIGN_LINKS.map((link) => ({
      ...link,
      href: `/campaigns/${campaignId}/${link.href}`,
    })),
    ACTIVITY_LOG_LINK,
  ].filter((link) => pageAccessKeys(link.permission).some((k) => held.has(k)));

  if (links.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">Quick Links</h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Only the sections your permissions let you open.
      </p>

      {/* One column at 375px, two from sm, three from lg — the description line
          needs roughly 40 characters to avoid reading as a stack of fragments,
          which a third column cannot give it below ~1024px. */}
      <StaggerGroup className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => (
          <StaggerItem key={link.href} className="h-full">
            <Link
              href={link.href}
              // These DO navigate, so they get the affordance the stat tiles
              // deliberately don't: a lift, a shadow and a border tint on hover.
              // 150ms is the `fast` token — the ceiling for something that has to
              // keep up with a moving pointer.
              className="group flex h-full items-start gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-neutral-800 dark:bg-neutral-900"
            >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon name={link.icon} className="text-[22px]" />
            </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1 font-semibold text-foreground">
                  {link.label}
                  <Icon
                    name="arrow_forward"
                    className="text-[16px] text-neutral-400 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                  />
                </p>
                <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                  {link.description}
                </p>
                {link.platformWide && (
                  <span className="mt-2 inline-flex rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300">
                    Platform-wide
                  </span>
                )}
              </div>
            </Link>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </section>
  );
}

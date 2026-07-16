import { PermissionKey } from "@/generated/prisma/enums";

/**
 * Single source of truth for the permission that gates *read access* to each
 * campaign-scoped page. Keyed by the page's sub-path under
 * `/campaigns/[campaignId]/`. Used in three places, which must never drift
 * apart:
 *   1. the page itself, via `requirePermission` (route-level guard),
 *   2. the sidebar, to decide whether to render the link at all, and
 *   3. any future middleware/testing that needs the page↔permission map.
 *
 * Note on final-decision: ENTER_FINAL_DECISION gates whether the page loads.
 * VIEW_COMMITTEE_DASHBOARD is a *separate* read-only committee view and no
 * longer stands in for entering the final-decision screen.
 */
export const CAMPAIGN_PAGE_PERMISSIONS = {
  applicants: PermissionKey.VIEW_FULL_POOL,
  phase1: PermissionKey.SCREEN_PHASE1,
  interviews: PermissionKey.CLAIM_PANEL_SEAT,
  "final-decision": PermissionKey.ENTER_FINAL_DECISION,
  statistics: PermissionKey.VIEW_STATISTICS,
} as const satisfies Record<string, PermissionKey>;

export type CampaignPage = keyof typeof CAMPAIGN_PAGE_PERMISSIONS;

/**
 * Platform-wide (non-campaign-scoped) pages and their gating permission. These
 * live outside any campaign context — e.g. the audit log.
 */
export const PLATFORM_PAGE_PERMISSIONS = {
  "/activity-log": PermissionKey.VIEW_ACTIVITY_LOG,
} as const satisfies Record<string, PermissionKey>;

/**
 * The Configuration page composes independently-gated sections. Anyone holding
 * at least one of these permissions may reach it.
 */
export const CONFIGURATION_PERMISSIONS: readonly PermissionKey[] = [
  PermissionKey.MANAGE_CAPACITY,
  PermissionKey.CONFIGURE_SCREENING,
];

/**
 * Holding *any* of these permissions means the user has something to do inside
 * a campaign, so the currently-open campaign(s) are shown and enterable for
 * them. (Closed campaigns are gated separately — see
 * {@link CAMPAIGN_HISTORY_PERMISSIONS}.)
 */
export const CAMPAIGN_ACCESS_PERMISSIONS: readonly PermissionKey[] = [
  PermissionKey.VIEW_FULL_POOL,
  PermissionKey.SCREEN_PHASE1,
  PermissionKey.CLAIM_PANEL_SEAT,
  PermissionKey.ENTER_FINAL_DECISION,
  PermissionKey.VIEW_STATISTICS,
  PermissionKey.MANAGE_CAPACITY,
  PermissionKey.CONFIGURE_SCREENING,
  PermissionKey.MANAGE_ACCOUNTS,
];

/**
 * Holding any of these lets a user see and enter *closed* (archived) campaigns.
 */
export const CAMPAIGN_HISTORY_PERMISSIONS: readonly PermissionKey[] = [
  PermissionKey.VIEW_CAMPAIGN_HISTORY,
  PermissionKey.MANAGE_ACCOUNTS,
];

/**
 * Holding any of these lets a user create a new campaign.
 */
export const CAMPAIGN_CREATE_PERMISSIONS: readonly PermissionKey[] = [
  PermissionKey.MANAGE_CAMPAIGNS,
  PermissionKey.MANAGE_ACCOUNTS,
];

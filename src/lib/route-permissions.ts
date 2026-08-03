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
 * Note on final-decision: ENTER_FINAL_DECISION alone gates whether the page
 * loads. It is the only key that opens it — a Committee Rep without it does not
 * see the page at all.
 *
 * Statistics and Interviews are deliberately ABSENT from this map: both are open
 * to every authenticated member, so neither has a gating permission for the
 * guards, the sidebar or the audit script to look up.
 *
 * Interviews earns its place in that company because the panel board is a
 * roster — who is interviewing whom, and when. That is something every member
 * has a legitimate reason to read, and reading it is all an ordinary member can
 * do: the board renders without a single control for them. The page's *writable*
 * sections keep their own gates (SEND_EMAILS, ENTER_INTERVIEW_SLOT), and which
 * seats a viewer may touch is decided per-seat from the live lead holders, which
 * is a far narrower bar than any page-level permission could express.
 */
export const CAMPAIGN_PAGE_PERMISSIONS = {
  applicants: PermissionKey.VIEW_FULL_POOL,
  // Phase 1 admits EITHER permission — an "any of these grants access" entry.
  // Full reviewers hold SCREEN_PHASE1; the Technical Scorer holds only
  // ENTER_TECHNICAL_SCORE yet must reach the page to score Technical Skills
  // (they get a restricted view). Per-question editability is enforced inside
  // the page and the save action.
  phase1: [PermissionKey.SCREEN_PHASE1, PermissionKey.ENTER_TECHNICAL_SCORE],
  // Selection is SCREEN_PHASE1 only — deliberately narrower than the scoring
  // queue above. The ranked view is built entirely from weighted totals, which
  // the technical-only viewer is never shown (they score one question and see
  // no aggregate), so ENTER_TECHNICAL_SCORE must not open this page.
  "phase1/selection": PermissionKey.SCREEN_PHASE1,
  "final-decision": PermissionKey.ENTER_FINAL_DECISION,
} as const satisfies Record<string, PermissionKey | readonly PermissionKey[]>;

export type CampaignPage = keyof typeof CAMPAIGN_PAGE_PERMISSIONS;

/**
 * Normalize a page-permission entry to a list. An entry is either a single
 * PermissionKey or an array meaning "holding any of these grants access". Both
 * the route guards and the sidebar use this so their access logic can't drift.
 */
export function pageAccessKeys(
  entry: PermissionKey | readonly PermissionKey[],
): readonly PermissionKey[] {
  // PermissionKey is a string enum, so a bare entry is a string; an array isn't.
  return typeof entry === "string" ? [entry] : entry;
}

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
  // SEND_EMAILS holders own the Final Decision Email Links section, so the page
  // has something for them even when the other two sections stay hidden.
  PermissionKey.SEND_EMAILS,
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

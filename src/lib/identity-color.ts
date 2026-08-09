import { Committee, LeadRole } from "@/generated/prisma/enums";

/**
 * What colour a person is rendered in — the ONE resolution rule, shared by
 * avatars and by the committee/role badges on Permission Management, so the
 * same person can never appear in two colours on one screen.
 *
 * Pure and DB-free on purpose: callers hand it a committee and whatever lead
 * roles that person holds in the relevant scope (see identity-color-store.ts
 * for loading those), and it decides. No component reimplements this.
 */
export type IdentityColor =
  | "committee-tm"
  | "committee-mkt"
  | "committee-eer"
  | "lead-club"
  | "lead-technical";

const COMMITTEE_COLOR: Record<Committee, IdentityColor> = {
  [Committee.TM]: "committee-tm",
  [Committee.MKT]: "committee-mkt",
  [Committee.EER]: "committee-eer",
};

/**
 * Lead roles that OVERRIDE their holder's committee colour.
 *
 * Only the two cross-committee titles are here. MKT_LEAD and EER_LEAD are
 * absent BY DESIGN rather than by omission: LEAD_ROLE_COMMITTEE restricts each
 * to its own committee, so resolving them through the committee branch below
 * already yields green/yellow — exactly the colour an explicit entry would
 * give. Adding them would be a second way to compute the same answer, and a
 * second thing to keep consistent if the restriction ever changes.
 */
const LEAD_COLOR: Partial<Record<LeadRole, IdentityColor>> = {
  [LeadRole.CLUB_LEAD]: "lead-club",
  [LeadRole.TECHNICAL_LEAD]: "lead-technical",
};

/**
 * A cross-committee lead title wins over the holder's home committee; everyone
 * else takes their committee's colour.
 *
 * `leadRoles` is scoped by the caller — one campaign's roles on a campaign
 * page, all open campaigns' roles on global screens. Order within it doesn't
 * matter: both overriding roles map to the same red, and one member can hold
 * only one lead title per campaign anyway.
 */
export function resolveIdentityColor({
  committee,
  leadRoles = [],
}: {
  committee: Committee;
  leadRoles?: readonly LeadRole[];
}): IdentityColor {
  for (const role of leadRoles) {
    const override = LEAD_COLOR[role];
    if (override) return override;
  }
  return COMMITTEE_COLOR[committee];
}

/**
 * Tailwind classes per colour, written out in full because Tailwind can only
 * see class names that appear literally in source — `bg-${color}/10` would
 * compile to nothing.
 *
 * `tint` is the badge/avatar treatment (washed background + saturated ink);
 * `solid` is for the rare element that needs the colour at full strength.
 */
export const IDENTITY_TINT_CLASS: Record<IdentityColor, string> = {
  "committee-tm": "bg-committee-tm/10 text-committee-tm",
  "committee-mkt": "bg-committee-mkt/10 text-committee-mkt",
  "committee-eer": "bg-committee-eer/10 text-committee-eer",
  "lead-club": "bg-lead-club/10 text-lead-club",
  "lead-technical": "bg-lead-technical/10 text-lead-technical",
};

export const IDENTITY_TEXT_CLASS: Record<IdentityColor, string> = {
  "committee-tm": "text-committee-tm",
  "committee-mkt": "text-committee-mkt",
  "committee-eer": "text-committee-eer",
  "lead-club": "text-lead-club",
  "lead-technical": "text-lead-technical",
};

/** Convenience: resolve straight to the tint classes most call sites want. */
export function identityTintClass(input: {
  committee: Committee;
  leadRoles?: readonly LeadRole[];
}): string {
  return IDENTITY_TINT_CLASS[resolveIdentityColor(input)];
}

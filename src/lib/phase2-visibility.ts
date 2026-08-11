// Who may READ Phase 2 notes and flags — the single statement of that rule.
//
// Free of database ACCESS, but NOT importable from a client component: it reads
// LEAD_ROLE_COMMITTEE from campaign-leads.ts, which imports prisma, so pulling
// this into a browser bundle drags `pg` in with it. The pieces the client cards
// genuinely need — Phase2Surface and surfaceOfEntryType — live in phase2.ts,
// which is the client-safe half of this pair, and are re-exported below so
// server callers have one import site.
//
// Nothing here governs WRITING an entry. Appending a note or a flag stays open
// to every authenticated member, unchanged.

import { Committee, LeadRole } from "@/generated/prisma/enums";
import { LEAD_ROLE_COMMITTEE } from "@/lib/campaign-leads";
import { surfaceOfEntryType, type Phase2Surface } from "@/lib/phase2";

export { surfaceOfEntryType };
export type { Phase2Surface };

/**
 * Open/closed for both surfaces, as stored on Phase2VisibilityConfig.
 *
 * NULL MEANS OPEN, matching InterviewNote.closedAt. A campaign with no config
 * row at all is therefore fully open, which is what keeps this feature from
 * silently hiding anything on campaigns that existed before it shipped.
 */
export type Phase2VisibilityState = {
  notesClosed: boolean;
  flagsClosed: boolean;
};

/** Everything about the VIEWER that the rule below depends on. */
export type Phase2Viewer = {
  /** True for the sole TM_LEAD — reads through both switches, always. */
  isAdministrator: boolean;
  /**
   * The CampaignLead titles this viewer holds IN THIS CAMPAIGN. Scoped by the
   * caller, exactly like identity-color-store's leadRoles.
   */
  leadRoles: readonly LeadRole[];
};

/**
 * The committees a viewer's lead titles make them responsible for.
 *
 * Read straight off LEAD_ROLE_COMMITTEE, the same table that decides who may
 * HOLD each title — so "MKT Lead covers MKT applicants" is stated once, and a
 * change to that restriction can't leave this rule behind.
 *
 * Club Lead and Technical Lead map to null there (both are deliberately
 * committee-less) and so contribute NOTHING here: neither title grants any
 * automatic read-through on its own. That is intended, not an oversight — a
 * cross-committee title would otherwise silently defeat every closed switch.
 */
export function committeesLedBy(
  leadRoles: readonly LeadRole[],
): Set<Committee> {
  const out = new Set<Committee>();
  for (const role of leadRoles) {
    const committee = LEAD_ROLE_COMMITTEE[role];
    if (committee !== null) out.add(committee);
  }
  return out;
}

/**
 * May `viewer` read `surface` for an applicant who prefers `committee`?
 *
 * Three tiers, in precedence order:
 *   1. Administrator — always, through any closed switch.
 *   2. A committee-matched Campaign Lead (MKT Lead → MKT applicants, EER Lead
 *      → EER applicants) — always, through any closed switch, but ONLY for
 *      their own committee's applicants. Club/Technical Lead match nothing.
 *   3. Everyone else — only while the Administrator leaves that switch open.
 *
 * Tiers 1 and 2 are NOT gated by the toggle: the switch exists to control the
 * wider membership, and closing it must never lock out the people accountable
 * for the decision.
 */
export function canViewPhase2Surface({
  viewer,
  surface,
  applicantCommittee,
  state,
}: {
  viewer: Phase2Viewer;
  surface: Phase2Surface;
  /** The applicant's preferred committee — what "their own committee" means. */
  applicantCommittee: Committee;
  state: Phase2VisibilityState;
}): boolean {
  if (viewer.isAdministrator) return true;
  if (committeesLedBy(viewer.leadRoles).has(applicantCommittee)) return true;
  return surface === "notes" ? !state.notesClosed : !state.flagsClosed;
}

/**
 * Whether a viewer can see a surface for AT LEAST ONE applicant in a set —
 * i.e. whether that column should be rendered at all.
 *
 * This is what makes a closed column DISAPPEAR for a regular member rather
 * than render as a row of blanks: the table asks this once per surface, and
 * omits the whole column when it answers false. A matched Lead still gets the
 * column (their own committee's rows populate it) with other committees' cells
 * simply empty.
 */
export function canViewAnyPhase2Surface({
  viewer,
  surface,
  applicantCommittees,
  state,
}: {
  viewer: Phase2Viewer;
  surface: Phase2Surface;
  applicantCommittees: readonly Committee[];
  state: Phase2VisibilityState;
}): boolean {
  return applicantCommittees.some((applicantCommittee) =>
    canViewPhase2Surface({ viewer, surface, applicantCommittee, state }),
  );
}

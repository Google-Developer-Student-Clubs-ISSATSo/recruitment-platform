import { prisma } from "@/lib/prisma";
import { getClubLeadId } from "@/lib/panel-authority";
import { SEAT_KIND_COMMITTEE } from "@/lib/panel-seat-kind";
import { PanelSeatKind, PermissionKey } from "@/generated/prisma/enums";

// Who a lead may put in a seat.
//
// The rule is stated once here and enforced again per-write in panel-seat.ts's
// isEligibleForSeat — this builds the list the UI offers, that one is the
// boundary. They must agree, and the comment on each says why the pool is what
// it is; if you change one, change both.

/** One member as the assignment picker renders them. */
export type PanelCandidate = { id: string; name: string };

/**
 * Everyone eligible for panel duty, with the committee that decides which seats
 * they can take. One query, reused across every seat kind on a page — the pool
 * doesn't vary by seat, only the filter over it does.
 *
 * CLAIM_PANEL_SEAT is what makes someone a candidate. Under self-serve claiming
 * it was the member's own licence to take a seat; now it marks who their lead
 * may choose. Same meaning, different hand on the control.
 */
async function loadEligibleMembers() {
  return prisma.user.findMany({
    where: {
      permissions: { some: { permission: PermissionKey.CLAIM_PANEL_SEAT } },
    },
    select: { id: true, name: true, email: true, committee: true },
    orderBy: { name: "asc" },
  });
}

/**
 * The candidate list for each of the given seat kinds.
 *
 * A committee seat takes members of that committee, plus the Club Lead — who
 * may sit on any panel, subject to the owning lead's approval. The floating
 * seat belongs to no committee, so it takes anyone eligible.
 *
 * Returns an empty map for an empty `kinds`, without touching the database: a
 * member who leads nothing has no picker to populate, which is most viewers.
 */
export async function getPanelCandidatesByKind(
  campaignId: string,
  kinds: readonly PanelSeatKind[],
): Promise<Record<string, PanelCandidate[]>> {
  if (kinds.length === 0) return {};

  const [members, clubLeadId] = await Promise.all([
    loadEligibleMembers(),
    getClubLeadId(campaignId),
  ]);

  const byKind: Record<string, PanelCandidate[]> = {};
  for (const kind of kinds) {
    const committee = SEAT_KIND_COMMITTEE[kind];
    byKind[kind] = members
      .filter(
        (m) =>
          committee === null ||
          m.committee === committee ||
          m.id === clubLeadId,
      )
      // Seed accounts may have no display name; the email is what the rest of
      // the app falls back to, so the picker matches the board's labels.
      .map((m) => ({ id: m.id, name: m.name ?? m.email }));
  }
  return byKind;
}

/** Every seat kind, for the Administrator — who may staff all of them. */
export const ALL_SEAT_KINDS = Object.values(PanelSeatKind) as PanelSeatKind[];

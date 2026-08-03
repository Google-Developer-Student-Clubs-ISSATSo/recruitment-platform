import { Committee, LeadRole, PanelSeatKind } from "@/generated/prisma/enums";

// The seat vocabulary, in one place. Pure and dependency-free — imported by
// client components, the board grouping and the server-side authorization
// alike, so none of them can disagree about what a seat kind means.

/**
 * Every seat kind in fixed display order. Panels are built by taking the first
 * `panelSize` of these, so FLOATING is last by construction: a 3-seat panel is
 * the three committees, a 4-seat panel adds the floating seat.
 */
export const SEAT_KIND_ORDER: readonly PanelSeatKind[] = [
  PanelSeatKind.MKT,
  PanelSeatKind.TM,
  PanelSeatKind.EER,
  PanelSeatKind.FLOATING,
];

export const SEAT_KIND_LABEL: Record<PanelSeatKind, string> = {
  [PanelSeatKind.MKT]: "MKT",
  [PanelSeatKind.TM]: "TM",
  [PanelSeatKind.EER]: "EER",
  [PanelSeatKind.FLOATING]: "Floating",
};

/**
 * The committee a seat belongs to, or null for the floating seat.
 *
 * This is the ONLY place the deliberate name overlap between `PanelSeatKind`
 * and `Committee` is turned into an actual mapping. Everywhere else the two
 * enums stay apart, because `Committee` also answers "which committee did this
 * applicant apply to / get accepted into", where FLOATING is meaningless.
 */
export const SEAT_KIND_COMMITTEE: Record<PanelSeatKind, Committee | null> = {
  [PanelSeatKind.MKT]: Committee.MKT,
  [PanelSeatKind.TM]: Committee.TM,
  [PanelSeatKind.EER]: Committee.EER,
  [PanelSeatKind.FLOATING]: null,
};

/**
 * Which lead role owns a seat — i.e. who fills it and who approves a Club Lead
 * asking for it.
 *
 * TM is null and that is not an oversight: TM has no CampaignLead row by
 * design, because the TM committee's lead IS the Administrator. Callers must
 * handle that case by resolving the current Administrator instead — see
 * `resolveSeatAuthority` in panel-authority.ts, which is where that branch
 * lives so no caller has to remember it.
 */
export const SEAT_KIND_LEAD_ROLE: Record<PanelSeatKind, LeadRole | null> = {
  [PanelSeatKind.MKT]: LeadRole.MKT_LEAD,
  [PanelSeatKind.TM]: null,
  [PanelSeatKind.EER]: LeadRole.EER_LEAD,
  [PanelSeatKind.FLOATING]: LeadRole.CLUB_LEAD,
};

/** Is this seat one of the three committee seats (as opposed to floating)? */
export function isCommitteeSeat(kind: PanelSeatKind): boolean {
  return SEAT_KIND_COMMITTEE[kind] !== null;
}

export function seatKindLabel(kind: PanelSeatKind): string {
  return SEAT_KIND_LABEL[kind];
}

/** One panel seat as the read-only "who sat on this panel" lists render it. */
export type JurySeat = { kind: PanelSeatKind; name: string | null };

/**
 * The panel's jury in fixed seat order, with an unfilled seat's name left null
 * so the gaps stay visible.
 *
 * Built from the panel's OWN seats rather than from a fixed list of kinds:
 * panel size is per-campaign, and a panel keeps the shape it was created with,
 * so listing a fixed set would either hide a floating seat or invent one that
 * doesn't exist on that panel.
 */
export function buildJury(
  seats: {
    kind: PanelSeatKind;
    claimedBy: { name: string | null; email: string } | null;
  }[],
): JurySeat[] {
  const order = new Map(SEAT_KIND_ORDER.map((k, i) => [k, i]));
  return [...seats]
    .sort((a, b) => (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0))
    .map((s) => ({
      kind: s.kind,
      name: s.claimedBy ? (s.claimedBy.name ?? s.claimedBy.email) : null,
    }));
}

import { prisma } from "@/lib/prisma";
import { getCampaignLeadHolders } from "@/lib/campaign-leads";
import { SEAT_KIND_LEAD_ROLE } from "@/lib/panel-seat-kind";
import { LeadRole, PanelSeatKind, RoleTemplateName } from "@/generated/prisma/enums";

// Who is allowed to do what to a panel seat.
//
// EVERY function here resolves authority LIVE, from the current CampaignLead
// rows and the current Administrator — never from a value stored on the row
// being acted upon. That is the whole point: a lead title can be reassigned at
// any moment, and authority has to move with the title. An outgoing lead must
// not keep power over work created while they held the role, and an incoming
// one must not be locked out of it. Same reasoning as InterviewNote's computed
// AVG and the live capacity counts — a stored copy of something that tracks
// current state is a copy that can be wrong.

/**
 * The current Administrator: the sole holder of the TM_LEAD role template.
 *
 * `findFirst` matches how the rest of the app resolves this (the applicant
 * webhook, the admin-transfer accept flow) — the "exactly one Administrator"
 * rule is an application invariant enforced by the transfer flow, not a
 * database constraint, so this reads the invariant rather than asserting it.
 */
export async function getAdministratorId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { roleTemplate: { name: RoleTemplateName.TM_LEAD } },
    select: { id: true },
  });
  return admin?.id ?? null;
}

/**
 * Who currently owns each seat kind on this campaign: the user who may fill it,
 * and who may answer a Club Lead's request for it.
 *
 * One resolution pass shared by every caller, so "the TM seat belongs to the
 * Administrator" is stated once rather than in each action.
 */
export async function resolveSeatAuthorities(
  campaignId: string,
): Promise<Record<PanelSeatKind, string | null>> {
  const [holders, administratorId] = await Promise.all([
    getCampaignLeadHolders(campaignId),
    getAdministratorId(),
  ]);

  const authorityFor = (kind: PanelSeatKind): string | null => {
    const role = SEAT_KIND_LEAD_ROLE[kind];
    // TM alone has no CampaignLead row — its lead is the Administrator.
    if (role === null) return administratorId;
    return holders[role]?.userId ?? null;
  };

  return {
    [PanelSeatKind.MKT]: authorityFor(PanelSeatKind.MKT),
    [PanelSeatKind.TM]: authorityFor(PanelSeatKind.TM),
    [PanelSeatKind.EER]: authorityFor(PanelSeatKind.EER),
    [PanelSeatKind.FLOATING]: authorityFor(PanelSeatKind.FLOATING),
  };
}

/** Who currently owns this one seat kind. Null when the role is unassigned. */
export async function resolveSeatAuthority(
  campaignId: string,
  kind: PanelSeatKind,
): Promise<string | null> {
  return (await resolveSeatAuthorities(campaignId))[kind];
}

/**
 * The lead roles that may staff the floating seat.
 *
 * The floating seat belongs to no committee, so unlike the three committee
 * seats it has no single owning lead — any of the campaign's committee leads
 * may fill it. (The Administrator can too, via the MANAGE_ACCOUNTS override
 * every seat honours, which is also how the TM committee's lead reaches it —
 * TM's lead IS the Administrator, so they need no entry here.)
 */
const FLOATING_ASSIGNER_ROLES: readonly LeadRole[] = [
  LeadRole.MKT_LEAD,
  LeadRole.EER_LEAD,
  LeadRole.CLUB_LEAD,
];

/**
 * Everyone who may staff each seat kind right now, live.
 *
 * A committee seat has exactly one such person — its lead — so its list holds
 * one id, or none when the title is vacant. The floating seat is the reason
 * these are lists at all.
 */
export async function resolveSeatAssigners(
  campaignId: string,
): Promise<Record<PanelSeatKind, string[]>> {
  const [authorities, holders] = await Promise.all([
    resolveSeatAuthorities(campaignId),
    getCampaignLeadHolders(campaignId),
  ]);

  const owning = (kind: PanelSeatKind): string[] => {
    const owner = authorities[kind];
    return owner === null ? [] : [owner];
  };

  return {
    [PanelSeatKind.MKT]: owning(PanelSeatKind.MKT),
    [PanelSeatKind.TM]: owning(PanelSeatKind.TM),
    [PanelSeatKind.EER]: owning(PanelSeatKind.EER),
    [PanelSeatKind.FLOATING]: FLOATING_ASSIGNER_ROLES.map(
      (role) => holders[role]?.userId,
    ).filter((id): id is string => id != null),
  };
}

/** Everyone who may staff this one seat kind. */
export async function resolveSeatAssignersFor(
  campaignId: string,
  kind: PanelSeatKind,
): Promise<string[]> {
  return (await resolveSeatAssigners(campaignId))[kind];
}

/**
 * The current approver for a Club Lead's request on this seat — the same person
 * as the seat's authority. Separate name because the two roles read differently
 * at the call sites, and because FLOATING is explicitly not approvable: it is
 * the Club Lead's own seat, so a request for it should never have been created.
 */
export async function resolveSeatApprover(
  campaignId: string,
  kind: PanelSeatKind,
): Promise<string | null> {
  if (kind === PanelSeatKind.FLOATING) return null;
  return resolveSeatAuthority(campaignId, kind);
}

/** The current Club Lead for this campaign, if the title is filled. */
export async function getClubLeadId(campaignId: string): Promise<string | null> {
  const holders = await getCampaignLeadHolders(campaignId);
  return holders[LeadRole.CLUB_LEAD]?.userId ?? null;
}

export type SeatPowers = {
  /** Seat kinds this user may fill/empty outright, as one of their leads. */
  ownedKinds: PanelSeatKind[];
  /** True if this user is the campaign's Club Lead. */
  isClubLead: boolean;
  /** True if this user is the Administrator (owns the TM seat, and overrides). */
  isAdministrator: boolean;
};

/**
 * Everything the board needs to know about one viewer's powers, in a single
 * resolution pass — so a page rendering a whole board doesn't re-derive the
 * lead holders per card.
 */
export async function getSeatPowers(
  campaignId: string,
  userId: string,
): Promise<SeatPowers> {
  const [assigners, administratorId, clubLeadId] = await Promise.all([
    resolveSeatAssigners(campaignId),
    getAdministratorId(),
    getClubLeadId(campaignId),
  ]);

  const ownedKinds = (Object.keys(assigners) as PanelSeatKind[]).filter((kind) =>
    assigners[kind].includes(userId),
  );

  return {
    ownedKinds,
    isClubLead: clubLeadId === userId,
    isAdministrator: administratorId === userId,
  };
}

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { hasPermission } from "@/lib/permissions";
import { isInterviewDone } from "@/lib/interview-note";
import { SEAT_KIND_COMMITTEE, seatKindLabel } from "@/lib/panel-seat-kind";
import {
  getClubLeadId,
  resolveSeatApprover,
  resolveSeatAssignersFor,
} from "@/lib/panel-authority";
import {
  ApprovalStatus,
  PanelSeatKind,
  PermissionKey,
} from "@/generated/prisma/enums";

// Panel staffing. Seats are ASSIGNED by the lead who owns them — there is no
// self-serve claiming: an interviewer does not put themselves on a panel, their
// committee's lead rosters them onto it.
//
// Who owns which seat is resolved live on every call (see panel-authority.ts),
// never read off a stored column, so reassigning a lead title immediately moves
// the power that goes with it.

export type SeatResult =
  /**
   * `awaitingApproval` marks the one success that changed no seat: a Club Lead's
   * assignment became a request. The UI needs to say "sent for approval" rather
   * than "assigned", so the distinction is carried rather than inferred.
   */
  | { ok: true; awaitingApproval?: boolean }
  | { ok: false; error: string };

const FROZEN_ERROR =
  "That interview is already completed — its panel can't be changed. Reopen the interview note first.";

/** Why a member can't take a seat — same wording wherever eligibility fails. */
function ineligibleError(kind: PanelSeatKind): string {
  return kind === PanelSeatKind.FLOATING
    ? "That member isn't eligible for panel duty."
    : `That member isn't eligible for the ${seatKindLabel(kind)} seat — they're not in that committee, or not eligible for panel duty.`;
}

/**
 * Load a seat with everything the authorization checks need: its kind, which
 * campaign its applicant belongs to, who currently holds it, and whether that
 * applicant's interview is already done. Callers pass only a seat id, so all of
 * this is re-read server-side rather than trusted from the request.
 */
async function loadSeat(seatId: string) {
  return prisma.panelSeat.findUnique({
    where: { id: seatId },
    select: {
      id: true,
      kind: true,
      claimedById: true,
      panel: {
        select: {
          applicant: {
            select: {
              id: true,
              fullName: true,
              campaignId: true,
              // The committee this applicant asked for. A Club Lead is barred
              // from that committee's seat outright — see assignPanelSeat.
              preferredCommittee: true,
              // Pulled in the same round-trip, so the frozen-panel guard costs
              // no extra query.
              interviewNote: { select: { closedAt: true } },
            },
          },
        },
      },
    },
  });
}

type LoadedSeat = NonNullable<Awaited<ReturnType<typeof loadSeat>>>;

/**
 * Resolve a seat and check the things every seat mutation checks: it exists, it
 * belongs to this campaign, and its interview isn't already written up.
 *
 * The frozen check is deliberately shared: once the note is closed the seats
 * have stopped being a staffing plan and become the record of who actually
 * conducted the interview. Rewriting that after the fact would leave the note
 * attributed to a panel nobody appears to have sat on — so it is refused for
 * leads and the Administrator alike, not just for ordinary members.
 */
async function loadMutableSeat(
  campaignId: string,
  seatId: string,
): Promise<
  { ok: true; seat: LoadedSeat; applicant: LoadedSeat["panel"]["applicant"] } | { ok: false; error: string }
> {
  const seat = await loadSeat(seatId);
  const applicant = seat?.panel.applicant;

  if (!seat || !applicant || applicant.campaignId !== campaignId) {
    return { ok: false, error: "That interview panel isn't in this campaign." };
  }
  if (isInterviewDone(applicant.interviewNote)) {
    return { ok: false, error: FROZEN_ERROR };
  }
  return { ok: true, seat, applicant };
}

/**
 * May `userId` staff this seat outright, with no approval step?
 *
 * Two ways: they are one of that seat kind's current leads (exactly one person
 * for a committee seat; any committee lead for the floating seat), or they hold
 * MANAGE_ACCOUNTS — the Administrator, who owns the TM seat anyway and acts as
 * the override everywhere else in the app. Everyone else — including the Club
 * Lead on a committee seat — goes through the approval flow instead.
 */
async function canFillDirectly(
  campaignId: string,
  kind: PanelSeatKind,
  userId: string,
): Promise<boolean> {
  const [assigners, isAdmin] = await Promise.all([
    resolveSeatAssignersFor(campaignId, kind),
    hasPermission(userId, PermissionKey.MANAGE_ACCOUNTS),
  ]);
  return assigners.includes(userId) || isAdmin;
}

/**
 * Is this member eligible to sit in this seat?
 *
 * Two conditions, both required:
 *
 *  - They hold CLAIM_PANEL_SEAT. The permission's meaning is unchanged by the
 *    move to lead-controlled staffing — it has always said "this member is
 *    eligible for panel duty". What changed is who acts on it: it used to be
 *    the member's own licence to claim, and is now the pool their lead picks
 *    from. Someone without it isn't on panels at all.
 *  - Their committee matches the seat. The whole point of a committee seat is
 *    that the committee is represented on the panel. The one exception is the
 *    Club Lead, who may sit on any committee's seat (with that lead's approval,
 *    enforced by the caller, not here).
 *
 * The floating seat has no committee, so any eligible member may sit in it.
 */
async function isEligibleForSeat(
  campaignId: string,
  kind: PanelSeatKind,
  assigneeId: string,
): Promise<boolean> {
  if (!(await hasPermission(assigneeId, PermissionKey.CLAIM_PANEL_SEAT))) {
    return false;
  }

  const committee = SEAT_KIND_COMMITTEE[kind];
  if (committee === null) return true;

  const [assignee, clubLeadId] = await Promise.all([
    prisma.user.findUnique({
      where: { id: assigneeId },
      select: { committee: true },
    }),
    getClubLeadId(campaignId),
  ]);
  if (!assignee) return false;
  if (assignee.committee === committee) return true;
  return assigneeId === clubLeadId;
}

/**
 * Put a member in an empty seat.
 *
 * Three outcomes, decided by who is asking:
 *
 *  - The seat's own lead (or the Administrator) — the seat is filled here.
 *  - The Club Lead, on a committee seat that isn't theirs — nothing is filled;
 *    a PENDING request is raised for that committee's lead to answer, and the
 *    caller is told so via `awaitingApproval`.
 *  - Anyone else — refused.
 *
 * Race-safe by the same conditional-update trick the old claim flow used: the
 * write is scoped to `claimedById: null`, so two leads assigning the same seat
 * at the same instant are resolved by the database rather than one silently
 * overwriting the other.
 */
export async function assignPanelSeat(
  campaignId: string,
  seatId: string,
  assigneeId: string,
  actorId: string,
): Promise<SeatResult> {
  const loaded = await loadMutableSeat(campaignId, seatId);
  if (!loaded.ok) return loaded;
  const { seat, applicant } = loaded;

  // Eligibility is checked before authority routes the call, so a Club Lead
  // can't raise a request to seat someone who could never take the seat anyway.
  if (!(await isEligibleForSeat(campaignId, seat.kind, assigneeId))) {
    return { ok: false, error: ineligibleError(seat.kind) };
  }

  if (!(await canFillDirectly(campaignId, seat.kind, actorId))) {
    // The Club Lead doesn't get refused outright — their assignment becomes a
    // request for the seat's lead. Everyone else does.
    if (actorId === (await getClubLeadId(campaignId))) {
      return requestSeatApproval(campaignId, seatId, assigneeId, actorId);
    }
    return {
      ok: false,
      error: `Only the ${seatKindLabel(seat.kind)} seat's lead can assign that seat.`,
    };
  }

  const assigned = await prisma.panelSeat.updateMany({
    where: { id: seatId, claimedById: null },
    data: { claimedById: assigneeId, claimedAt: new Date() },
  });
  if (assigned.count === 0) {
    return { ok: false, error: "That seat has already been filled." };
  }

  // Any request still waiting on this seat is moot now that it is filled.
  await declineOpenRequestsFor(seatId);

  await logActivity({
    actorId,
    actionType: "PANEL_SEAT_ASSIGNED",
    targetType: "Applicant",
    targetId: applicant.id,
    campaignId,
    details: {
      seatKind: seat.kind,
      assigneeId,
      applicantName: applicant.fullName,
      selfAssigned: assigneeId === actorId,
    },
  });

  return { ok: true };
}

/**
 * Empty a seat. Same authority as filling it — the owning lead, or
 * MANAGE_ACCOUNTS. The person sitting in the seat cannot take themselves off
 * it: they didn't put themselves there, and a panel that members can quietly
 * leave is the problem this rework exists to fix.
 */
export async function unassignPanelSeat(
  campaignId: string,
  seatId: string,
  actorId: string,
): Promise<SeatResult> {
  const loaded = await loadMutableSeat(campaignId, seatId);
  if (!loaded.ok) return loaded;
  const { seat, applicant } = loaded;

  if (seat.claimedById === null) {
    return { ok: false, error: "That seat is already empty." };
  }

  if (!(await canFillDirectly(campaignId, seat.kind, actorId))) {
    return {
      ok: false,
      error: `Only the ${seatKindLabel(seat.kind)} seat's lead can change that seat.`,
    };
  }

  // Scoped to the holder we just read, so this can't clobber a seat that was
  // emptied and refilled by someone else in between.
  const cleared = await prisma.panelSeat.updateMany({
    where: { id: seatId, claimedById: seat.claimedById },
    data: { claimedById: null, claimedAt: null },
  });
  if (cleared.count === 0) {
    return { ok: false, error: "That seat just changed — reload and try again." };
  }

  await logActivity({
    actorId,
    actionType: "PANEL_SEAT_UNASSIGNED",
    targetType: "Applicant",
    targetId: applicant.id,
    campaignId,
    details: {
      seatKind: seat.kind,
      removedUserId: seat.claimedById,
      applicantName: applicant.fullName,
    },
  });

  return { ok: true };
}

/**
 * Swap the person sitting in a seat for someone else, in one action.
 *
 * Same authority as filling it: the seat's lead, or the Administrator. Not a
 * remove-then-assign from the UI's side, because that pair leaves the seat
 * momentarily empty — long enough for another lead's assignment to land in the
 * gap, and long enough for the board to render a panel as short-staffed when
 * nobody intended it to be.
 *
 * The Club Lead's request route deliberately does NOT extend here: a request
 * only ever fills an empty seat, so there is no coherent "approve" for one that
 * would evict its current holder. They ask the seat's lead directly instead.
 *
 * The frozen-panel guard in {@link loadMutableSeat} is what stops a lead
 * rewriting the panel after the interview is written up — the same rule the old
 * release path enforced against members, now checked against the lead's action
 * because the lead is the only one with an action left to check.
 */
export async function reassignPanelSeat(
  campaignId: string,
  seatId: string,
  assigneeId: string,
  actorId: string,
): Promise<SeatResult> {
  const loaded = await loadMutableSeat(campaignId, seatId);
  if (!loaded.ok) return loaded;
  const { seat, applicant } = loaded;

  if (seat.claimedById === null) {
    return { ok: false, error: "That seat is empty — assign it instead." };
  }
  if (seat.claimedById === assigneeId) {
    return { ok: false, error: "That member already holds this seat." };
  }

  if (!(await canFillDirectly(campaignId, seat.kind, actorId))) {
    return {
      ok: false,
      error: `Only the ${seatKindLabel(seat.kind)} seat's lead can change that seat.`,
    };
  }

  if (!(await isEligibleForSeat(campaignId, seat.kind, assigneeId))) {
    return { ok: false, error: ineligibleError(seat.kind) };
  }

  // Scoped to the holder we just read: if anyone else moved this seat in
  // between, this write matches nothing rather than overwriting their change.
  const swapped = await prisma.panelSeat.updateMany({
    where: { id: seatId, claimedById: seat.claimedById },
    data: { claimedById: assigneeId, claimedAt: new Date() },
  });
  if (swapped.count === 0) {
    return { ok: false, error: "That seat just changed — reload and try again." };
  }

  await logActivity({
    actorId,
    actionType: "PANEL_SEAT_REASSIGNED",
    targetType: "Applicant",
    targetId: applicant.id,
    campaignId,
    details: {
      seatKind: seat.kind,
      assigneeId,
      replacedUserId: seat.claimedById,
      applicantName: applicant.fullName,
    },
  });

  return { ok: true };
}

/** Close out any still-pending request on a seat that no longer needs one. */
async function declineOpenRequestsFor(seatId: string): Promise<void> {
  await prisma.panelSeatApprovalRequest.updateMany({
    where: { seatId, status: ApprovalStatus.PENDING },
    data: { status: ApprovalStatus.DECLINED, respondedAt: new Date() },
  });
}

// ============ CLUB LEAD SEAT REQUESTS ============

/**
 * The Club Lead asks a committee's lead for their seat — for themselves, or for
 * a member they want on that panel.
 *
 * The Club Lead is the one person who may reach across into any committee's
 * seat, but not silently — the seat's own lead has to agree. Nothing about the
 * seat changes here; only a PENDING request is created, exactly the shape
 * AdminTransferInvite uses for "nothing happens until the other party acts".
 *
 * Two seats are never requested. The floating seat needs no approval — the Club
 * Lead fills it directly. And the seat matching the applicant's OWN preferred
 * committee is refused outright, with no approval available: that seat is the
 * one voice on the panel speaking for the committee the applicant is actually
 * trying to join, and the Club Lead standing in for it would quietly remove the
 * cross-committee check the panel exists to provide. A lead cannot consent that
 * away, so it isn't offered as something to consent to.
 */
async function requestSeatApproval(
  campaignId: string,
  seatId: string,
  assigneeId: string,
  requesterId: string,
): Promise<SeatResult> {
  const loaded = await loadMutableSeat(campaignId, seatId);
  if (!loaded.ok) return loaded;
  const { seat, applicant } = loaded;

  const clubLeadId = await getClubLeadId(campaignId);
  if (clubLeadId === null || clubLeadId !== requesterId) {
    return {
      ok: false,
      error: "Only this campaign's Club Lead can request another committee's seat.",
    };
  }

  if (seat.kind === PanelSeatKind.FLOATING) {
    return {
      ok: false,
      error: "The floating seat is yours to fill — it needs no approval.",
    };
  }

  if (SEAT_KIND_COMMITTEE[seat.kind] === applicant.preferredCommittee) {
    return {
      ok: false,
      error: `${applicant.fullName} applied to ${seatKindLabel(seat.kind)}, so that seat has to be filled by ${seatKindLabel(seat.kind)} itself — it can't be requested.`,
    };
  }

  if (seat.claimedById !== null) {
    return { ok: false, error: "That seat has already been filled." };
  }

  if (!(await isEligibleForSeat(campaignId, seat.kind, assigneeId))) {
    return { ok: false, error: ineligibleError(seat.kind) };
  }

  const approverId = await resolveSeatApprover(campaignId, seat.kind);
  if (approverId === null) {
    return {
      ok: false,
      error: `The ${seatKindLabel(seat.kind)} seat has no lead assigned yet, so there is nobody to approve this.`,
    };
  }
  if (approverId === requesterId) {
    return {
      ok: false,
      error: "You already own that seat — assign it directly instead.",
    };
  }

  const existing = await prisma.panelSeatApprovalRequest.findFirst({
    where: {
      seatId,
      requestedById: requesterId,
      status: ApprovalStatus.PENDING,
    },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "You already have a pending request for that seat." };
  }

  await prisma.panelSeatApprovalRequest.create({
    data: {
      seatId,
      requestedById: requesterId,
      assigneeUserId: assigneeId,
      approverUserId: approverId,
    },
  });

  await logActivity({
    actorId: requesterId,
    actionType: "PANEL_SEAT_APPROVAL_REQUESTED",
    targetType: "Applicant",
    targetId: applicant.id,
    campaignId,
    details: {
      seatKind: seat.kind,
      assigneeId,
      approverUserId: approverId,
      applicantName: applicant.fullName,
    },
  });

  return { ok: true, awaitingApproval: true };
}

/**
 * Approve or decline a Club Lead's seat request.
 *
 * Authority is re-derived HERE, live, from the current lead holders — the
 * request's stored `approverUserId` is the record of who was asked when it was
 * raised, NOT the permission check. If the seat's lead has been replaced since,
 * only the current holder may answer: a former lead does not keep power over
 * requests that happen to predate their replacement, and the incoming lead is
 * not locked out of them.
 *
 * Approving fills the seat in the same transaction-free sequence assignment
 * uses, and re-checks the seat is still empty and still unfrozen — a request
 * can sit pending while the world moves on.
 */
export async function respondToSeatApproval(
  campaignId: string,
  requestId: string,
  approve: boolean,
  actorId: string,
): Promise<SeatResult> {
  const request = await prisma.panelSeatApprovalRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      requestedById: true,
      assigneeUserId: true,
      seatId: true,
      seat: { select: { kind: true } },
    },
  });
  if (!request) return { ok: false, error: "That request no longer exists." };
  if (request.status !== ApprovalStatus.PENDING) {
    return { ok: false, error: "That request has already been answered." };
  }

  // Requests raised before seats could be requested on someone else's behalf
  // carry no assignee; those all meant "the Club Lead themselves".
  const assigneeId = request.assigneeUserId ?? request.requestedById;

  const loaded = await loadMutableSeat(campaignId, request.seatId);
  if (!loaded.ok) return loaded;
  const { seat, applicant } = loaded;

  // LIVE authority — deliberately not request.approverUserId. See the doc
  // comment above and the schema comment on PanelSeatApprovalRequest.
  const [currentApprover, isAdmin] = await Promise.all([
    resolveSeatApprover(campaignId, seat.kind),
    hasPermission(actorId, PermissionKey.MANAGE_ACCOUNTS),
  ]);
  if (currentApprover !== actorId && !isAdmin) {
    return {
      ok: false,
      error: `Only the current ${seatKindLabel(seat.kind)} lead can answer that request.`,
    };
  }

  if (approve) {
    if (seat.claimedById !== null) {
      return { ok: false, error: "That seat has already been filled." };
    }
    // Re-checked at approval time, not just when the request was raised: the
    // named member may have changed committee, or lost panel eligibility, in
    // the time the request sat waiting.
    if (!(await isEligibleForSeat(campaignId, seat.kind, assigneeId))) {
      return { ok: false, error: ineligibleError(seat.kind) };
    }
    const filled = await prisma.panelSeat.updateMany({
      where: { id: seat.id, claimedById: null },
      data: { claimedById: assigneeId, claimedAt: new Date() },
    });
    if (filled.count === 0) {
      return { ok: false, error: "That seat has already been filled." };
    }
  }

  await prisma.panelSeatApprovalRequest.update({
    where: { id: request.id },
    data: {
      status: approve ? ApprovalStatus.APPROVED : ApprovalStatus.DECLINED,
      respondedAt: new Date(),
    },
  });

  await logActivity({
    actorId,
    actionType: approve
      ? "PANEL_SEAT_APPROVAL_GRANTED"
      : "PANEL_SEAT_APPROVAL_DECLINED",
    targetType: "Applicant",
    targetId: applicant.id,
    campaignId,
    details: {
      seatKind: seat.kind,
      requestedById: request.requestedById,
      assigneeId,
      applicantName: applicant.fullName,
    },
  });

  return { ok: true };
}

/**
 * Withdraw one's own pending request. No approval authority needed — this only
 * ever cancels a request the caller raised themselves.
 */
export async function cancelSeatApproval(
  campaignId: string,
  requestId: string,
  actorId: string,
): Promise<SeatResult> {
  const request = await prisma.panelSeatApprovalRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      requestedById: true,
      seat: {
        select: {
          kind: true,
          panel: {
            select: { applicant: { select: { id: true, campaignId: true } } },
          },
        },
      },
    },
  });
  if (!request) return { ok: false, error: "That request no longer exists." };
  if (request.seat.panel.applicant.campaignId !== campaignId) {
    return { ok: false, error: "That request isn't in this campaign." };
  }
  if (request.status !== ApprovalStatus.PENDING) {
    return { ok: false, error: "That request has already been answered." };
  }
  if (request.requestedById !== actorId) {
    return { ok: false, error: "You can only withdraw your own request." };
  }

  await prisma.panelSeatApprovalRequest.update({
    where: { id: request.id },
    data: { status: ApprovalStatus.DECLINED, respondedAt: new Date() },
  });

  await logActivity({
    actorId,
    actionType: "PANEL_SEAT_APPROVAL_WITHDRAWN",
    targetType: "Applicant",
    targetId: request.seat.panel.applicant.id,
    campaignId,
    details: { seatKind: request.seat.kind },
  });

  return { ok: true };
}

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { hasPermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";

export type SeatResult = { ok: true } | { ok: false; error: string };

/**
 * Load a seat together with everything the authorization checks need: which
 * campaign its applicant belongs to, and who (if anyone) currently holds it.
 * Callers pass only a seat id, so all of this is re-read server-side rather than
 * trusted from the request.
 */
async function loadSeat(seatId: string) {
  return prisma.panelSeat.findUnique({
    where: { id: seatId },
    select: {
      id: true,
      committee: true,
      claimedById: true,
      panel: {
        select: {
          applicant: {
            select: { id: true, fullName: true, campaignId: true },
          },
        },
      },
    },
  });
}

/**
 * Claim a panel seat for `userId`.
 *
 * Two rules, both enforced here rather than in the UI:
 *
 *  1. A user may only ever take the seat matching their OWN `User.committee`.
 *     The board hides other committees' Claim buttons, but hiding a button is
 *     not a boundary — the action is reachable by POST.
 *  2. The seat must still be unclaimed. This is a conditional `updateMany`
 *     scoped to `claimedById: null`, not a read-then-write: two people pressing
 *     Claim at the same instant both pass a prior existence check, but only one
 *     can match the null predicate, so the loser is rejected by the database
 *     rather than silently overwriting the winner.
 */
export async function claimPanelSeat(
  campaignId: string,
  seatId: string,
  userId: string,
): Promise<SeatResult> {
  const [seat, user] = await Promise.all([
    loadSeat(seatId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { committee: true },
    }),
  ]);

  if (!user) return { ok: false, error: "You are signed out." };

  const applicant = seat?.panel.applicant;
  if (!seat || !applicant || applicant.campaignId !== campaignId) {
    return { ok: false, error: "That interview panel isn't in this campaign." };
  }

  if (seat.committee !== user.committee) {
    return {
      ok: false,
      error: `That seat belongs to the ${seat.committee} committee — you can only claim your own committee's seat.`,
    };
  }

  const claimed = await prisma.panelSeat.updateMany({
    where: { id: seatId, claimedById: null },
    data: { claimedById: userId, claimedAt: new Date() },
  });

  if (claimed.count === 0) {
    return { ok: false, error: "Someone already claimed that seat." };
  }

  await logActivity({
    actorId: userId,
    actionType: "PANEL_SEAT_CLAIMED",
    targetType: "Applicant",
    targetId: applicant.id,
    details: { committee: seat.committee, applicantName: applicant.fullName },
  });

  return { ok: true };
}

/**
 * Release a panel seat. Allowed for the person currently holding it, or for any
 * MANAGE_ACCOUNTS holder as a TM Lead override — the case where an interviewer
 * can no longer make the session and someone has to free the seat for them.
 */
export async function releasePanelSeat(
  campaignId: string,
  seatId: string,
  userId: string,
): Promise<SeatResult> {
  const seat = await loadSeat(seatId);

  const applicant = seat?.panel.applicant;
  if (!seat || !applicant || applicant.campaignId !== campaignId) {
    return { ok: false, error: "That interview panel isn't in this campaign." };
  }

  if (seat.claimedById === null) {
    return { ok: false, error: "That seat isn't claimed." };
  }

  const isOwnClaim = seat.claimedById === userId;
  const isOverride =
    !isOwnClaim && (await hasPermission(userId, PermissionKey.MANAGE_ACCOUNTS));

  if (!isOwnClaim && !isOverride) {
    return {
      ok: false,
      error: "You can only release a seat you claimed yourself.",
    };
  }

  // Scoped to the holder we just read, so a release can't clobber a seat that
  // was released and re-claimed by someone else in between.
  const released = await prisma.panelSeat.updateMany({
    where: { id: seatId, claimedById: seat.claimedById },
    data: { claimedById: null, claimedAt: null },
  });

  if (released.count === 0) {
    return { ok: false, error: "That seat just changed — reload and try again." };
  }

  await logActivity({
    actorId: userId,
    actionType: "PANEL_SEAT_RELEASED",
    targetType: "Applicant",
    targetId: applicant.id,
    details: {
      committee: seat.committee,
      applicantName: applicant.fullName,
      releasedUserId: seat.claimedById,
      override: isOverride,
    },
  });

  return { ok: true };
}

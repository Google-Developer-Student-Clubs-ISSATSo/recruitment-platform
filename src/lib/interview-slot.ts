import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { parseTunisLocal } from "@/lib/tunis-time";
import { getSeatKindsFor } from "@/lib/interview-config";
import { ApplicantStatus, ApprovalStatus } from "@/generated/prisma/enums";

/**
 * Ensure an applicant has an InterviewPanel, built with one empty seat of each
 * kind this campaign's panel size calls for.
 *
 * A panel is shaped once, at creation, and then left alone. An applicant who
 * already has a panel keeps exactly the seats it was built with, even if the
 * campaign's panel size changed afterwards: panels created before the setting
 * existed, or while it said 3, stay three-seated forever. Growing 3 → 4
 * therefore applies to interviews scheduled from that point on and never
 * reshapes a panel the leads have already staffed — a settings toggle silently
 * adding a seat to every scheduled applicant would be a far bigger action than
 * the control implies. Shrinking likewise never deletes a seat somebody may
 * already be sitting in.
 *
 * Idempotent and safe to race: `applicantId` is @unique, so a concurrent
 * caller's insert loses with P2002, which is treated as "the panel exists" —
 * the outcome this function promises. Seats are created in the same statement
 * as the panel, so a panel is never observable half-seated.
 */
async function ensurePanel(
  campaignId: string,
  applicantId: string,
): Promise<void> {
  const existing = await prisma.interviewPanel.findUnique({
    where: { applicantId },
    select: { id: true },
  });
  if (existing) return;

  const kinds = await getSeatKindsFor(campaignId);

  try {
    await prisma.interviewPanel.create({
      data: {
        applicantId,
        seats: { create: kinds.map((kind) => ({ kind })) },
      },
    });
  } catch (error) {
    // P2002 on InterviewPanel.applicantId — a concurrent save created the panel
    // between the check above and this insert. Theirs stands, seats and all.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }
}

/**
 * What clearing this applicant's time would strand on the board — the numbers
 * the confirmation step quotes back before it happens.
 */
export type ClearImpact = {
  /** Seats currently holding an interviewer. */
  assignedSeats: number;
  /** Club Lead seat requests still waiting on an answer. */
  pendingRequests: number;
};

export type SaveSlotResult =
  | { ok: true; scheduledTimeISO: string | null; room: string | null }
  | {
      ok: false;
      error: string;
      /**
       * Set only when the save was refused *pending confirmation* rather than
       * rejected: the input was valid, and re-sending it with `confirmClear`
       * will go through. Absent on every real validation failure, so the caller
       * can tell "ask the user" apart from "this was wrong".
       */
      clearImpact?: ClearImpact;
    };

/**
 * Core of the manual slot-entry write, factored out of the server action so it
 * can run either behind the action's ENTER_INTERVIEW_SLOT gate or from a test
 * harness (a headless context can't mint the auth session the action needs) —
 * the same split {@link runPhaseOneEmailBatch} uses. Authorization is the
 * caller's job: this assumes `userId` is already allowed to enter slots.
 *
 * Both fields are clearable. An empty date/time returns the applicant to "not
 * yet booked", which also puts them back in the reminder batch's sights; an
 * empty room leaves the room unassigned, which is the normal state until shortly
 * before the session (hence the booking emails sending people to the library
 * first).
 *
 * Upserts, so it works whether or not the invite batch already created the row.
 *
 * Clearing a time that a staffed panel is hanging off is the one input this
 * refuses on the first attempt — see the confirmation check below. Pass
 * `confirmClear` to mean "I saw the warning, do it anyway".
 */
export async function saveInterviewSlot(
  campaignId: string,
  applicantId: string,
  scheduledTimeLocal: string,
  room: string,
  userId: string,
  confirmClear = false,
): Promise<SaveSlotResult> {
  // The caller says *which* applicant; everything else about them is re-read
  // here, so a request can't reach an applicant outside this campaign.
  //
  // The slot and panel come along in the same round-trip: both are needed only
  // on the clearing path, but fetching them conditionally would cost a second
  // query on exactly the save that is already the slowest.
  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: {
      campaignId: true,
      status: true,
      // What the time is *now*, so a clear can be told apart from a save that
      // was already empty and is only setting a room.
      interviewSlot: { select: { scheduledTime: true } },
      interviewPanel: {
        select: {
          seats: {
            select: {
              kind: true,
              claimedById: true,
              approvalRequests: {
                where: { status: ApprovalStatus.PENDING },
                // Enough to write an honest log line about each one that gets
                // auto-declined below — who asked, for whom, and of whom.
                select: {
                  id: true,
                  requestedById: true,
                  assigneeUserId: true,
                  approverUserId: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!applicant || applicant.campaignId !== campaignId) {
    return { ok: false, error: "That applicant isn't in this campaign." };
  }
  if (applicant.status !== ApplicantStatus.SHORTLISTED) {
    return {
      ok: false,
      error: "That applicant isn't shortlisted for an interview.",
    };
  }

  const trimmedTime = scheduledTimeLocal.trim();
  let scheduledTime: Date | null = null;
  if (trimmedTime !== "") {
    scheduledTime = parseTunisLocal(trimmedTime);
    if (!scheduledTime) {
      return { ok: false, error: "Enter a valid interview date and time." };
    }
  }

  const trimmedRoom = room.trim();
  const roomValue = trimmedRoom === "" ? null : trimmedRoom;

  // Clearing a time that a staffed panel hangs off needs saying out loud first.
  //
  // The seats themselves are not deleted — they survive on purpose (see the note
  // further down). What is lost is REACH: the board lists scheduled applicants
  // only, so the moment the time goes the card disappears, taking the assigned
  // interviewers with it. They keep their seats and get them back untouched when
  // a time is re-entered.
  //
  // A PENDING seat request cannot be left to survive the same way, which is why
  // the clear closes them out below rather than merely warning about them: a
  // request is a question put to a named lead, and the only place it can be
  // answered is the card that just vanished. Left alone it would sit PENDING
  // forever, un-approvable and un-withdrawable, while still blocking its seat —
  // `canAssign` is false wherever a request is open, so a stale one would freeze
  // that seat even after the interview is rescheduled.
  //
  // Only an actual clear counts: saving an already-empty time (to set a room,
  // say) changes nothing about the board and asks nothing.
  const isClearing =
    scheduledTime === null && applicant.interviewSlot?.scheduledTime != null;

  const seats = applicant.interviewPanel?.seats ?? [];
  // Flattened once: the open requests across every seat, each remembering the
  // seat it belongs to so the log can name it.
  const openRequests = seats.flatMap((seat) =>
    seat.approvalRequests.map((request) => ({ ...request, seatKind: seat.kind })),
  );
  const clearImpact: ClearImpact = {
    assignedSeats: seats.filter((s) => s.claimedById !== null).length,
    pendingRequests: openRequests.length,
  };
  // Measured from the panel itself rather than from `confirmClear`, so the flag
  // describes what was actually stranded — a caller POSTing `confirmClear` on an
  // unstaffed panel doesn't get a misleading log entry out of it.
  const strandsPanel =
    isClearing &&
    (clearImpact.assignedSeats > 0 || clearImpact.pendingRequests > 0);

  if (strandsPanel && !confirmClear) {
    return {
      ok: false,
      error: "This interview's panel is already staffed.",
      clearImpact,
    };
  }

  const data = {
    scheduledTime,
    room: roomValue,
    enteredById: userId,
    enteredAt: new Date(),
  };

  // Requests to close out as part of this clear. Empty on every other save, so
  // the common path is the plain upsert it always was.
  const autoDeclined = isClearing ? openRequests : [];

  if (autoDeclined.length > 0) {
    // One transaction, because a clear that emptied the slot but left the
    // requests PENDING is exactly the stranded state this is here to prevent —
    // and it would be invisible, since the card is gone either way.
    //
    // The status filter is repeated in the update rather than trusted from the
    // read above: a lead may have answered one of these between the two, and
    // that answer is a real decision this must not overwrite with DECLINED.
    await prisma.$transaction([
      prisma.interviewSlot.upsert({
        where: { applicantId },
        create: { applicantId, ...data },
        update: data,
      }),
      prisma.panelSeatApprovalRequest.updateMany({
        where: {
          id: { in: autoDeclined.map((r) => r.id) },
          status: ApprovalStatus.PENDING,
        },
        data: { status: ApprovalStatus.DECLINED, respondedAt: new Date() },
      }),
    ]);

    // Logged separately from the slot entry below, and under its own action
    // type, because it is not a decision anybody made: the approver never saw
    // this, and the log must not read as though they declined it. One entry for
    // the batch with the affected list in `details`, like every other bulk
    // action in the app.
    await logActivity({
      actorId: userId,
      actionType: "PANEL_SEAT_APPROVAL_AUTO_DECLINED",
      targetType: "Applicant",
      targetId: applicantId,
      campaignId,
      details: {
        reason: "Auto-declined: the interview slot was cleared.",
        // Names the actor's role in this precisely — they cleared the time, they
        // did not answer anybody's request.
        automatic: true,
        count: autoDeclined.length,
        requests: autoDeclined.map((r) => ({
          requestId: r.id,
          seatKind: r.seatKind,
          requestedById: r.requestedById,
          assigneeId: r.assigneeUserId ?? r.requestedById,
          // The lead who would have answered it, had it stayed reachable.
          approverUserId: r.approverUserId,
        })),
      },
    });
  } else {
    await prisma.interviewSlot.upsert({
      where: { applicantId },
      create: { applicantId, ...data },
      update: data,
    });
  }

  // Having a scheduled time is exactly what puts an applicant on the panel
  // board, so any save that leaves one set makes sure the panel is there to
  // staff. `ensurePanel` no-ops once a panel exists, so re-running it on a
  // later time adjustment neither recreates the panel nor touches its seats —
  // and an applicant scheduled *before* panels existed gets one on their next
  // edit instead of sitting on the board unstaffable forever.
  //
  // Clearing a time back to null deliberately does NOT tear the panel down:
  // that would silently discard the leads' staffing work. The applicant simply
  // drops off the board (which only lists scheduled applicants) until
  // rescheduled, seats intact. Only PENDING requests are closed out (above),
  // because unlike a seat those cannot survive being unreachable.
  if (scheduledTime != null) {
    await ensurePanel(campaignId, applicantId);
  }

  await logActivity({
    actorId: userId,
    actionType: "INTERVIEW_SLOT_ENTERED",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    details: {
      scheduledTime: scheduledTime?.toISOString() ?? null,
      room: roomValue,
      // Only recorded when it happened: a confirmed clear that took a staffed
      // panel off the board. The seats survive but become unreachable, so the
      // log is the only place that would show why a panel stopped appearing.
      // Any pending requests it closed out get their own entry, above.
      ...(strandsPanel ? { clearedStaffedPanel: clearImpact } : {}),
    },
  });

  return {
    ok: true,
    scheduledTimeISO: scheduledTime?.toISOString() ?? null,
    room: roomValue,
  };
}

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { parseTunisLocal } from "@/lib/tunis-time";
import { ApplicantStatus, Committee } from "@/generated/prisma/enums";

// Every panel has exactly one seat per committee. Declared here (rather than
// derived from Object.values(Committee)) so the board's fixed MKT → TM → EER
// display order and the rows actually created can't drift apart.
export const PANEL_COMMITTEES: readonly Committee[] = [
  Committee.MKT,
  Committee.TM,
  Committee.EER,
];

/**
 * Ensure an applicant has an InterviewPanel with one unclaimed seat per
 * committee. Idempotent and safe to race: the panel upsert keys off
 * `applicantId` (@unique) and the seat insert relies on
 * `@@unique([panelId, committee])` with skipDuplicates, so concurrent callers
 * converge on exactly one panel and three seats.
 *
 * The seat pass runs even when the panel already existed, so a panel that
 * somehow lost a seat row heals on the next scheduling rather than staying
 * permanently unclaimable.
 */
async function ensurePanel(applicantId: string): Promise<void> {
  const panel = await prisma.interviewPanel.upsert({
    where: { applicantId },
    create: { applicantId },
    update: {},
    select: { id: true },
  });

  await prisma.panelSeat.createMany({
    data: PANEL_COMMITTEES.map((committee) => ({ panelId: panel.id, committee })),
    skipDuplicates: true,
  });
}

export type SaveSlotResult =
  | { ok: true; scheduledTimeISO: string | null; room: string | null }
  | { ok: false; error: string };

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
 */
export async function saveInterviewSlot(
  campaignId: string,
  applicantId: string,
  scheduledTimeLocal: string,
  room: string,
  userId: string,
): Promise<SaveSlotResult> {
  // The caller says *which* applicant; everything else about them is re-read
  // here, so a request can't reach an applicant outside this campaign.
  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: { campaignId: true, status: true },
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

  const data = {
    scheduledTime,
    room: roomValue,
    enteredById: userId,
    enteredAt: new Date(),
  };
  await prisma.interviewSlot.upsert({
    where: { applicantId },
    create: { applicantId, ...data },
    update: data,
  });

  // Having a scheduled time is exactly what puts an applicant on the
  // panel-claiming board, so any save that leaves one set makes sure the panel
  // is there to claim. `ensurePanel` upserts, so re-running it on a later time
  // adjustment neither recreates the panel nor disturbs seats already claimed
  // on it — and an applicant scheduled *before* panels existed gets one on
  // their next edit instead of sitting on the board unstaffable forever.
  //
  // Clearing a time back to null deliberately does NOT tear the panel down:
  // that would silently discard people's claims. The applicant simply drops off
  // the board (which only lists scheduled applicants) until rescheduled.
  if (scheduledTime != null) {
    await ensurePanel(applicantId);
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
    },
  });

  return {
    ok: true,
    scheduledTimeISO: scheduledTime?.toISOString() ?? null,
    room: roomValue,
  };
}

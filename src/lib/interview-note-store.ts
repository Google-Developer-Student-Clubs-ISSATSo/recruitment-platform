import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { isValidRating, type NoteFieldKey } from "@/lib/interview-note";

// Server-only persistence for the interview note. Split from
// interview-note.ts so the pure helpers there stay importable from client
// components without pulling prisma into the browser bundle.

export type SaveNoteResult = { ok: true } | { ok: false; error: string };

/**
 * Write one rating field. Factored out of the server action so it can run
 * behind the action's access check or from a test harness. Authorization is the
 * caller's job — this assumes `userId` may already edit this note.
 *
 * Upserts, so the row appears on the first score entered rather than needing to
 * be pre-created with the panel.
 */
export async function saveNoteRating(
  applicantId: string,
  campaignId: string,
  field: NoteFieldKey,
  value: number | null,
  userId: string,
): Promise<SaveNoteResult> {
  if (value !== null && !isValidRating(value)) {
    return { ok: false, error: "That score isn't a valid 0–10 value." };
  }

  await prisma.interviewNote.upsert({
    where: { applicantId },
    create: { applicantId, [field]: value },
    update: { [field]: value },
  });

  await logActivity({
    actorId: userId,
    actionType: "INTERVIEW_NOTE_UPDATED",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    details: { field, value },
  });

  return { ok: true };
}

/** Write the free-text remarks. Empty input clears the field back to null. */
export async function saveNoteRemarks(
  applicantId: string,
  campaignId: string,
  remarks: string,
  userId: string,
): Promise<SaveNoteResult> {
  const trimmed = remarks.trim();
  const value = trimmed === "" ? null : trimmed;

  await prisma.interviewNote.upsert({
    where: { applicantId },
    create: { applicantId, remarks: value },
    update: { remarks: value },
  });

  await logActivity({
    actorId: userId,
    actionType: "INTERVIEW_NOTE_UPDATED",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    details: { field: "remarks", value },
  });

  return { ok: true };
}

/**
 * Close an interview note — locks it to MANAGE_ACCOUNTS only from here on (see
 * canEditInterviewNote / canViewInterviewNote). Upserts, so it works even before
 * any rating has been entered: closing is allowed at any time. Authorization is
 * the caller's job.
 */
export async function closeInterviewNote(
  applicantId: string,
  campaignId: string,
  userId: string,
): Promise<SaveNoteResult> {
  await prisma.interviewNote.upsert({
    where: { applicantId },
    create: { applicantId, closedAt: new Date(), closedById: userId },
    update: { closedAt: new Date(), closedById: userId },
  });

  await logActivity({
    actorId: userId,
    actionType: "INTERVIEW_NOTE_CLOSED",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
  });

  return { ok: true };
}

/**
 * Reopen a closed interview note — clears closedAt/closedById, restoring normal
 * panel-member access. MANAGE_ACCOUNTS only; enforced by the caller.
 */
export async function reopenInterviewNote(
  applicantId: string,
  campaignId: string,
  userId: string,
): Promise<SaveNoteResult> {
  await prisma.interviewNote.update({
    where: { applicantId },
    data: { closedAt: null, closedById: null },
  });

  await logActivity({
    actorId: userId,
    actionType: "INTERVIEW_NOTE_REOPENED",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
  });

  return { ok: true };
}

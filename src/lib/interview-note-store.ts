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
 * any rating has been entered. Authorization — including the "has the slot time
 * passed yet" gate — is the caller's job; see closeInterviewNoteAction.
 *
 * `forced` records WHICH path was taken, and is only ever true for an
 * Administrator closing ahead of the scheduled time. It changes nothing about
 * the write: the point is that the log can tell the two apart afterwards, so a
 * note closed before its interview can be traced rather than being
 * indistinguishable from an ordinary close.
 */
export async function closeInterviewNote(
  applicantId: string,
  campaignId: string,
  userId: string,
  forced?: { scheduledTime: Date; allowedAt: Date },
): Promise<SaveNoteResult> {
  const closedAt = new Date();

  await prisma.interviewNote.upsert({
    where: { applicantId },
    create: { applicantId, closedAt, closedById: userId },
    update: { closedAt, closedById: userId },
  });

  await logActivity({
    actorId: userId,
    actionType: forced
      ? "INTERVIEW_NOTE_FORCE_CLOSED"
      : "INTERVIEW_NOTE_CLOSED",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    // Only the force path carries detail, and it carries the facts that make
    // the override reviewable: when the interview was due, when closing would
    // have become normally available, and how far ahead of that it happened.
    details: forced
      ? {
          reason:
            "Administrator force-closed before the interview's scheduled time.",
          scheduledTimeISO: forced.scheduledTime.toISOString(),
          normallyAllowedAtISO: forced.allowedAt.toISOString(),
          minutesEarly: Math.round(
            (forced.allowedAt.getTime() - closedAt.getTime()) / 60_000,
          ),
        }
      : undefined,
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

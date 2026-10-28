import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import {
  computeAverage,
  formatAverage,
  isValidRating,
  NOTE_FIELDS,
  type NoteScores,
} from "@/lib/interview-note";

// Server-only persistence for the interview note. Split from
// interview-note.ts so the pure helpers there stay importable from client
// components without pulling prisma into the browser bundle.

export type SaveNoteResult = { ok: true } | { ok: false, error: string };

/** Note content as it is handed to closeInterviewNote for storing. */
export type NoteContent = { scores: NoteScores; remarks: string };

/**
 * Close an interview note — and record its content in the same write. After
 * this the note is READ-ONLY for everyone, TM Lead included (see
 * evaluateNoteAccess); reopening, an admin-only act, is the one way back into
 * it. Authorization — including the "has the slot time passed yet" gate and the
 * completeness gate — is the caller's job; see closeInterviewNoteAction.
 *
 * Closing IS the save (there is no separate save path for an open note), so the
 * seven ratings and remarks travel in as `content` and land in the SAME upsert
 * as closedAt — one write, not two, and never a saved note that failed to
 * close.
 *
 * Exactly ONE activity-log entry comes out of this. The old save-then-close
 * pair produced an INTERVIEW_NOTE_UPDATED immediately followed by a
 * INTERVIEW_NOTE_CLOSED for the same actor in the same instant — the same fact
 * logged twice — so the close entry now carries what was entered: each rating
 * named in `details.ratings`, the running average, and whether remarks were
 * recorded (the remarks text itself lives in the note row, not the log).
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
  content?: NoteContent,
  forced?: { scheduledTime: Date; allowedAt: Date },
): Promise<SaveNoteResult> {
  let scores: NoteScores | undefined;
  let remarksValue: string | null = null;
  let average: number | null = null;

  if (content) {
    for (const [field, value] of Object.entries(content.scores) as [
      keyof NoteScores,
      number | null,
    ][]) {
      if (value !== null && !isValidRating(value)) {
        return {
          ok: false,
          error: `The ${field} score isn't a valid 0–10 value.`,
        };
      }
    }
    scores = content.scores;
    // Empty input clears the field back to null, same rule the editor applies.
    const trimmed = content.remarks.trim();
    remarksValue = trimmed === "" ? null : trimmed;
    average = computeAverage(content.scores);
  }

  const closedAt = new Date();

  await prisma.interviewNote.upsert({
    where: { applicantId },
    create: {
      applicantId,
      closedAt,
      closedById: userId,
      ...scores,
      remarks: remarksValue,
    },
    update: { closedAt, closedById: userId, ...scores, remarks: remarksValue },
  });

  // Flattened rather than nested: formatDetails stringifies each value for the
  // Details column, so "personality" has to be "Personality 7.25" from the
  // start, not an object that renders as "[object Object]".
  await logActivity({
    actorId: userId,
    actionType: forced
      ? "INTERVIEW_NOTE_FORCE_CLOSED"
      : "INTERVIEW_NOTE_CLOSED",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    details: {
      ...(scores && {
        ratings: NOTE_FIELDS.map(
          (f) => `${f.label} ${scores[f.key] ?? "—"}`,
        ).join(", "),
        ...(average !== null && { average: formatAverage(average) }),
        remarks: remarksValue ? "recorded" : "none",
      }),
      // Only the force path carries the facts that make the override
      // reviewable: when the interview was due, when closing would have become
      // normally available, and how far ahead of that it happened.
      ...(forced && {
        reason:
          "Administrator force-closed before the interview's scheduled time.",
        scheduledTimeISO: forced.scheduledTime.toISOString(),
        normallyAllowedAtISO: forced.allowedAt.toISOString(),
        minutesEarly: Math.round(
          (forced.allowedAt.getTime() - closedAt.getTime()) / 60_000,
        ),
      }),
    },
  });

  return { ok: true };
}

/**
 * Reopen a closed interview note — clears closedAt/closedById, restoring normal
 * panel-member access (and editability, for everyone). MANAGE_ACCOUNTS only;
 * enforced by the caller. One entry, covering the one thing that happened.
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

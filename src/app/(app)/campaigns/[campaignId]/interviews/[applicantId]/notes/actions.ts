"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditInterviewNote, hasPermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import {
  isNoteFieldKey,
  isValidRating,
  NOTE_FIELDS,
  noteCloseEligibility,
  type NoteScores,
} from "@/lib/interview-note";
import { formatTunisDateTime } from "@/lib/tunis-time";
import {
  closeInterviewNote,
  reopenInterviewNote,
  type SaveNoteResult,
} from "@/lib/interview-note-store";

// Interview note actions. Close is gated on canEditInterviewNote, which is the
// panel-membership check — NOT merely the EDIT_OWN_INTERVIEW_NOTES permission,
// which every interviewer holds. Being off the panel means these actions refuse
// you even if you POST directly.

/**
 * Confirm the caller may edit this note AND that the applicant really belongs
 * to the campaign in the URL. The applicant id comes from the client, so its
 * campaign is re-read here rather than trusted.
 */
async function authorize(
  campaignId: string,
  applicantId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You are signed out." };

  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: { campaignId: true },
  });
  if (!applicant || applicant.campaignId !== campaignId) {
    return { ok: false, error: "That applicant isn't in this campaign." };
  }

  if (!(await canEditInterviewNote(userId, applicantId))) {
    return {
      ok: false,
      error:
        "You can only close notes for interviews you're on the panel for — and a closed note must be reopened first.",
    };
  }

  return { ok: true, userId };
}

/** Collect + client-validate the seven ratings nothing is trusted from. */
function cleanScores(
  scores: Record<string, number | null>,
): { ok: true; scores: NoteScores } | { ok: false; error: string } {
  const clean: NoteScores = {
    personality: null,
    communication: null,
    motivation: null,
    creativity: null,
    problemSolving: null,
    stressManagement: null,
    teamWork: null,
  };
  for (const [field, value] of Object.entries(scores)) {
    if (!isNoteFieldKey(field)) {
      return { ok: false, error: "Unknown rating field." };
    }
    if (value !== null && !isValidRating(value)) {
      return { ok: false, error: "A score isn't a valid 0–10 value." };
    }
    clean[field] = value;
  }
  return { ok: true, scores: clean };
}

/**
 * Close this interview note — and SAVE it in the same request. There is no
 * separate save path for an open note: closing is the one act that writes,
 * which is why the two live in one action rather than two round-trips.
 *
 * Gated on {@link authorize} — for an OPEN note that means a panel member
 * (EDIT_OWN_INTERVIEW_NOTES + a seat) or MANAGE_ACCOUNTS. Closing revokes the
 * panel member's own access afterwards, so both the notes path and the
 * interviews board (whose notes link keys off the same access check) are
 * revalidated.
 *
 * COMPLETENESS GATE, enforced HERE and not only in the UI: all seven ratings
 * must be non-null BEFORE the note may be closed, whatever the client believed.
 *
 * TIMING GATE, also enforced HERE. A note cannot be closed until the
 * interview's scheduled time plus a short grace has passed (see
 * noteCloseEligibility). The button being disabled is a courtesy; this is the
 * rule, and it holds against a direct POST with whatever arguments.
 *
 * `force` is the Administrator's override, and it is an explicit argument
 * rather than something inferred: the server refuses an early close even for an
 * Administrator unless they passed it, so a stray or replayed call cannot
 * bypass the confirmation step the UI puts in front of them. It states an
 * intent the caller had to opt into, the same shape setPhase2Visibility uses.
 */
export async function closeInterviewNoteAction(
  campaignId: string,
  applicantId: string,
  scores: Record<string, number | null>,
  remarks: string,
  force = false,
): Promise<SaveNoteResult> {
  const gate = await authorize(campaignId, applicantId);
  if (!gate.ok) return gate;

  const cleaned = cleanScores(scores);
  if (!cleaned.ok) return cleaned;

  if (NOTE_FIELDS.some((f) => cleaned.scores[f.key] === null)) {
    return {
      ok: false,
      error: "All seven ratings must be set before the note can be closed.",
    };
  }

  // Read fresh rather than trusting anything the client sent: the slot may have
  // been rescheduled since the page rendered.
  const slot = await prisma.interviewSlot.findUnique({
    where: { applicantId },
    select: { scheduledTime: true },
  });
  const eligibility = noteCloseEligibility({
    scheduledTime: slot?.scheduledTime,
    now: new Date(),
  });

  let forced: { scheduledTime: Date; allowedAt: Date } | undefined;

  if (eligibility.state === "too_early") {
    const isManage = await hasPermission(
      gate.userId,
      PermissionKey.MANAGE_ACCOUNTS,
    );
    if (!isManage) {
      return {
        ok: false,
        error: `This interview is scheduled for ${formatTunisDateTime(
          slot!.scheduledTime!,
        )}. The note can be closed from ${formatTunisDateTime(
          eligibility.allowedAt,
        )}.`,
      };
    }
    if (!force) {
      return {
        ok: false,
        error:
          "This interview hasn't happened yet — confirm the force close to continue.",
      };
    }
    forced = {
      scheduledTime: slot!.scheduledTime!,
      allowedAt: eligibility.allowedAt,
    };
  }

  // Everything is validated: ONE request = ONE database write (all seven
  // ratings + remarks + closedAt, together) and ONE activity-log entry — the
  // close entry carries what was entered, so closing never produces the
  // save-plus-close double log it used to.
  const result = await closeInterviewNote(
    applicantId,
    campaignId,
    gate.userId,
    { scores: cleaned.scores, remarks: typeof remarks === "string" ? remarks : "" },
    forced,
  );
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews/${applicantId}/notes`);
  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return { ok: true };
}

/**
 * Reopen a closed interview note. MANAGE_ACCOUNTS only — the panel member who
 * closed it can no longer even see it, so reopening is strictly an admin act.
 */
export async function reopenInterviewNoteAction(
  campaignId: string,
  applicantId: string,
): Promise<SaveNoteResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You are signed out." };

  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: { campaignId: true },
  });
  if (!applicant || applicant.campaignId !== campaignId) {
    return { ok: false, error: "That applicant isn't in this campaign." };
  }

  if (!(await hasPermission(userId, PermissionKey.MANAGE_ACCOUNTS))) {
    return { ok: false, error: "Only account managers can reopen a closed note." };
  }

  const result = await reopenInterviewNote(applicantId, campaignId, userId);
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews/${applicantId}/notes`);
  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return { ok: true };
}

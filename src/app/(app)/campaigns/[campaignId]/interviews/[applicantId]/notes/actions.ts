"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditInterviewNote, hasPermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import { isNoteFieldKey } from "@/lib/interview-note";
import {
  saveNoteRating,
  saveNoteRemarks,
  closeInterviewNote,
  reopenInterviewNote,
  type SaveNoteResult,
} from "@/lib/interview-note-store";

// Interview note actions. Both are gated on canEditInterviewNote, which is the
// panel-membership check — NOT merely the EDIT_OWN_INTERVIEW_NOTES permission,
// which every interviewer holds. A Committee Rep reading someone else's note
// gets a read-only page, and these actions refuse them even if they POST
// directly.

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
      error: "You can only edit notes for interviews you're on the panel for.",
    };
  }

  return { ok: true, userId };
}

/** Save one of the seven ratings. `null` clears it. */
export async function saveNoteRatingAction(
  campaignId: string,
  applicantId: string,
  field: string,
  value: number | null,
): Promise<SaveNoteResult> {
  const gate = await authorize(campaignId, applicantId);
  if (!gate.ok) return gate;

  if (!isNoteFieldKey(field)) {
    return { ok: false, error: "Unknown rating field." };
  }

  const result = await saveNoteRating(applicantId, field, value, gate.userId);
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews/${applicantId}/notes`);
  return { ok: true };
}

/** Save the free-text remarks. */
export async function saveNoteRemarksAction(
  campaignId: string,
  applicantId: string,
  remarks: string,
): Promise<SaveNoteResult> {
  const gate = await authorize(campaignId, applicantId);
  if (!gate.ok) return gate;

  const result = await saveNoteRemarks(applicantId, remarks, gate.userId);
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews/${applicantId}/notes`);
  return { ok: true };
}

/**
 * Close this interview note. Gated on {@link canEditInterviewNote} — for an OPEN
 * note that means a panel member (EDIT_OWN_INTERVIEW_NOTES + a seat) or
 * MANAGE_ACCOUNTS. Closing revokes the panel member's own access afterwards, so
 * both the notes path and the interviews board (whose notes link keys off the
 * same access check) are revalidated.
 */
export async function closeInterviewNoteAction(
  campaignId: string,
  applicantId: string,
): Promise<SaveNoteResult> {
  const gate = await authorize(campaignId, applicantId);
  if (!gate.ok) return gate;

  const result = await closeInterviewNote(applicantId, gate.userId);
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

  const result = await reopenInterviewNote(applicantId, userId);
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews/${applicantId}/notes`);
  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return { ok: true };
}

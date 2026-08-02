"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { isPhase2EntryType, PHASE2_ENTRY_MAX_LENGTH } from "@/lib/phase2";
import { addPhase2Entry } from "@/lib/phase2-store";
import { PHASE_ONE_ACCEPTED } from "@/lib/phase1-ranking";

export type AddEntryResult = { ok: true } | { ok: false; error: string };

/**
 * Phase 2 entries need no permission beyond being signed in — the page is open
 * to every authenticated member, the same way Statistics is, so gating the write
 * behind a permission the reader doesn't need would just make the form fail.
 *
 * What IS checked, because it comes from the client: that the applicant exists,
 * belongs to the campaign in the URL (campaign scoping is via Applicant, not a
 * denormalized column, so it has to be re-read), and actually passed Phase 1.
 * Without the last check an entry could be attached to a rejected applicant who
 * never appears on this page — an invisible row in an append-only table.
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
    select: {
      campaignId: true,
      phaseOneResult: { select: { classification: true } },
    },
  });
  if (!applicant || applicant.campaignId !== campaignId) {
    return { ok: false, error: "That applicant isn't in this campaign." };
  }

  const classification = applicant.phaseOneResult?.classification;
  if (!classification || !PHASE_ONE_ACCEPTED.includes(classification)) {
    return { ok: false, error: "That applicant didn't pass Phase 1." };
  }

  return { ok: true, userId };
}

/**
 * Append a Note / Red Flag / Green Flag. Append-only by design: there is no
 * edit or delete action here, and adding one would defeat the point of the log
 * (see the Phase2Entry model comment). A mistake is corrected with another
 * entry.
 */
export async function addPhase2EntryAction(
  campaignId: string,
  applicantId: string,
  type: string,
  text: string,
): Promise<AddEntryResult> {
  const gate = await authorize(campaignId, applicantId);
  if (!gate.ok) return gate;

  if (!isPhase2EntryType(type)) {
    return { ok: false, error: "Unknown entry type." };
  }

  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, error: "Write something before adding it." };
  }
  if (trimmed.length > PHASE2_ENTRY_MAX_LENGTH) {
    return {
      ok: false,
      error: `Keep it under ${PHASE2_ENTRY_MAX_LENGTH} characters.`,
    };
  }

  await addPhase2Entry({
    applicantId,
    type,
    authorId: gate.userId,
    text: trimmed,
  });

  await logActivity({
    actorId: gate.userId,
    actionType: "PHASE2_ENTRY_ADDED",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    // The entry text itself stays out of the log: it's already stored, with its
    // author, on the row this points at. Only the kind is worth summarising.
    details: { type },
  });

  revalidatePath(`/campaigns/${campaignId}/phase2`);
  return { ok: true };
}

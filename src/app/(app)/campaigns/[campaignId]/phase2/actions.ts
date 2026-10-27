"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import {
  isMktTestKind,
  isPhase2EntryType,
  mktSkillsOf,
  normalizeMktTestLink,
  PHASE2_ENTRY_MAX_LENGTH,
} from "@/lib/phase2";
import {
  addPhase2Entry,
  canEditMktTests,
  getViewerCommittee,
} from "@/lib/phase2-store";
import { getMktSkillWhitelist } from "@/lib/mkt-skills-store";
import {
  canViewPhase2Surface,
  surfaceOfEntryType,
} from "@/lib/phase2-visibility";
import {
  getPhase2VisibilityState,
  getPhase2Viewer,
} from "@/lib/phase2-visibility-store";
import { PHASE_ONE_ACCEPTED } from "@/lib/phase1-ranking";
import type { Committee, MktTestKind } from "@/generated/prisma/enums";

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
): Promise<
  | { ok: true; userId: string; applicantCommittee: Committee }
  | { ok: false; error: string }
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You are signed out." };

  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: {
      campaignId: true,
      preferredCommittee: true,
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

  return { ok: true, userId, applicantCommittee: applicant.preferredCommittee };
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

  // You may only append to a surface you can currently READ for this applicant.
  //
  // Writing is otherwise unrestricted and stays that way — this is not a new
  // permission, it just keeps the server consistent with the UI, which stops
  // rendering a section the viewer cannot read. Without it a crafted POST could
  // append to a restricted surface, producing an append-only row its own author
  // cannot see to correct. Anyone who can see the box can still use it.
  const [viewer, visibility] = await Promise.all([
    getPhase2Viewer(campaignId, gate.userId),
    getPhase2VisibilityState(campaignId),
  ]);
  const permitted = canViewPhase2Surface({
    viewer,
    surface: surfaceOfEntryType(type),
    applicantCommittee: gate.applicantCommittee,
    state: visibility,
  });
  if (!permitted) {
    return {
      ok: false,
      error: "That section is restricted for this applicant.",
    };
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

/**
 * The marketing-test gate, on top of authorize(): the member must be on the
 * MKT committee (canEditMktTests — reading is club-wide, writing is not),
 * and the applicant must have listed a whitelisted MKT skill, the same bar the
 * page uses to show the test block at all. Without the second check a crafted
 * POST could attach a link to someone the page never shows one for.
 */
async function authorizeMktTest(
  campaignId: string,
  applicantId: string,
  kind: string,
): Promise<
  { ok: true; userId: string; kind: MktTestKind } | { ok: false; error: string }
> {
  const gate = await authorize(campaignId, applicantId);
  if (!gate.ok) return gate;

  if (!isMktTestKind(kind)) return { ok: false, error: "Unknown test." };

  const [committee, applicant, whitelist] = await Promise.all([
    getViewerCommittee(gate.userId),
    prisma.applicant.findUnique({
      where: { id: applicantId },
      select: { rawFormData: true },
    }),
    getMktSkillWhitelist(campaignId),
  ]);
  if (!canEditMktTests(committee)) {
    return {
      ok: false,
      error: "Only the MKT committee can record marketing tests.",
    };
  }
  const skills = mktSkillsOf(
    applicant?.rawFormData,
    whitelist.map((s) => s.skillName),
  );
  if (skills.listed.length === 0) {
    return { ok: false, error: "This applicant listed no MKT skill." };
  }

  return { ok: true, userId: gate.userId, kind };
}

/**
 * Record (or replace) the Drive link for one applicant's marketing test.
 * Existence is all that matters — there is no grade to enter.
 */
export async function setMktTestLinkAction(
  campaignId: string,
  applicantId: string,
  rawKind: string,
  link: string,
): Promise<AddEntryResult> {
  const gate = await authorizeMktTest(campaignId, applicantId, rawKind);
  if (!gate.ok) return gate;
  const { kind } = gate;

  const normalized = normalizeMktTestLink(link);
  if (!normalized) {
    return { ok: false, error: "Paste a full link, starting with https://." };
  }

  const where = { applicantId_kind: { applicantId, kind } };
  const previous = await prisma.mktTestSubmission.findUnique({
    where,
    select: { link: true },
  });
  if (previous?.link === normalized) return { ok: true };

  await prisma.mktTestSubmission.upsert({
    where,
    create: { applicantId, kind, link: normalized, submittedById: gate.userId },
    update: { link: normalized, submittedById: gate.userId },
  });

  await logActivity({
    actorId: gate.userId,
    actionType: "MKT_TEST_LINK_SET",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    details: { kind, link: normalized, previousLink: previous?.link ?? null },
  });

  revalidatePath(`/campaigns/${campaignId}/phase2`);
  return { ok: true };
}

/** Remove a recorded link, returning the test to "Not submitted". */
export async function removeMktTestLinkAction(
  campaignId: string,
  applicantId: string,
  rawKind: string,
): Promise<AddEntryResult> {
  const gate = await authorizeMktTest(campaignId, applicantId, rawKind);
  if (!gate.ok) return gate;
  const { kind } = gate;

  const removed = await prisma.mktTestSubmission.deleteMany({
    where: { applicantId, kind },
  });
  if (removed.count === 0) return { ok: true };

  await logActivity({
    actorId: gate.userId,
    actionType: "MKT_TEST_LINK_REMOVED",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    details: { kind },
  });

  revalidatePath(`/campaigns/${campaignId}/phase2`);
  return { ok: true };
}

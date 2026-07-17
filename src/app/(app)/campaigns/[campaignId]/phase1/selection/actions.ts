"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import {
  phaseOneCohortWhere,
  recalculatePhaseOneRanking,
} from "@/lib/phase1-ranking";
import {
  ApplicantStatus,
  PermissionKey,
  PhaseOneClassification,
} from "@/generated/prisma/enums";

// Phase 1 Selection actions. Every one of these is SCREEN_PHASE1-gated on the
// server, independently of the page guard — the ranked view is built from
// weighted totals the technical-only scorer never sees, so none of this may be
// reachable by calling the action directly.

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

// Typed as the full enum so `.includes()` accepts any classification — the
// inferred literal-union element type would reject everything else.
const ACCEPTED: readonly PhaseOneClassification[] = [
  PhaseOneClassification.AUTO_ACCEPT,
  PhaseOneClassification.MANUAL_ACCEPT,
];
const REJECTED: readonly PhaseOneClassification[] = [
  PhaseOneClassification.AUTO_REJECT,
  PhaseOneClassification.MANUAL_REJECT,
];

/** SCREEN_PHASE1 + campaign exists. Returns the actor's id. */
async function authorize(
  campaignId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You are signed out." };

  if (!(await hasPermission(userId, PermissionKey.SCREEN_PHASE1))) {
    return { ok: false, error: "You don't have permission to run Phase 1 selection." };
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!campaign) return { ok: false, error: "That campaign doesn't exist." };

  return { ok: true, userId };
}

export async function recalculateRankingAction(
  campaignId: string,
): Promise<ActionResult<{ completeCount: number; incompleteCount: number }>> {
  const gate = await authorize(campaignId);
  if (!gate.ok) return gate;

  const result = await recalculatePhaseOneRanking(campaignId);
  if (!result.ok) return result;

  await logActivity({
    actorId: gate.userId,
    actionType: "PHASE1_RANKING_RECALCULATED",
    targetType: "Campaign",
    targetId: campaignId,
    details: {
      complete: result.completeCount,
      incomplete: result.incompleteCount,
    },
  });

  revalidatePath(`/campaigns/${campaignId}/phase1/selection`);
  return {
    ok: true,
    completeCount: result.completeCount,
    incompleteCount: result.incompleteCount,
  };
}

/**
 * Resolve one TO_DISCUSS applicant to MANUAL_ACCEPT / MANUAL_REJECT. Only a
 * TO_DISCUSS row may be resolved: accepting or rejecting an applicant the
 * algorithm never flagged for discussion isn't a resolution, it's an override,
 * and this page doesn't offer that.
 */
export async function resolveToDiscussAction(
  campaignId: string,
  applicantId: string,
  outcome: "ACCEPT" | "REJECT",
): Promise<ActionResult<{ classification: PhaseOneClassification }>> {
  const gate = await authorize(campaignId);
  if (!gate.ok) return gate;

  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: {
      campaignId: true,
      phaseOneResult: {
        select: { classification: true, weightedTotal: true, rank: true },
      },
    },
  });
  if (!applicant || applicant.campaignId !== campaignId) {
    return { ok: false, error: "That applicant isn't in this campaign." };
  }

  const result = applicant.phaseOneResult;
  if (!result || result.classification !== PhaseOneClassification.TO_DISCUSS) {
    return {
      ok: false,
      error: "That applicant is no longer awaiting discussion — recalculate to refresh.",
    };
  }

  const classification =
    outcome === "ACCEPT"
      ? PhaseOneClassification.MANUAL_ACCEPT
      : PhaseOneClassification.MANUAL_REJECT;

  await prisma.phaseOneResult.update({
    where: { applicantId },
    data: { classification },
  });

  await logActivity({
    actorId: gate.userId,
    actionType: "PHASE1_MANUAL_RESOLUTION",
    targetType: "Applicant",
    targetId: applicantId,
    details: {
      outcome,
      weightedTotal: result.weightedTotal,
      rank: result.rank,
    },
  });

  revalidatePath(`/campaigns/${campaignId}/phase1/selection`);
  return { ok: true, classification };
}

/**
 * Commit Phase 1: write every complete applicant's outcome onto Applicant.status and
 * stamp the campaign. Hard-blocked while any TO_DISCUSS remains — an unresolved
 * discussion has no outcome to write. Incomplete applicants are deliberately
 * *not* blocking: they're left at their current status and reported back, since
 * real-world scoring may never reach every applicant.
 */
export async function finalizePhaseOneAction(
  campaignId: string,
): Promise<
  ActionResult<{ shortlisted: number; rejected: number; stillPending: number }>
> {
  const gate = await authorize(campaignId);
  if (!gate.ok) return gate;

  const applicants = await prisma.applicant.findMany({
    where: phaseOneCohortWhere(campaignId),
    select: { id: true, phaseOneResult: { select: { classification: true } } },
  });

  const classificationOf = (a: (typeof applicants)[number]) =>
    a.phaseOneResult?.classification ?? PhaseOneClassification.PENDING;

  if (applicants.some((a) => classificationOf(a) === PhaseOneClassification.TO_DISCUSS)) {
    return {
      ok: false,
      error: "Resolve every “to discuss” applicant before finalizing.",
    };
  }

  const toShortlist = applicants.filter((a) => ACCEPTED.includes(classificationOf(a)));
  const toReject = applicants.filter((a) => REJECTED.includes(classificationOf(a)));
  const stillPending = applicants.filter(
    (a) => classificationOf(a) === PhaseOneClassification.PENDING,
  );

  const finalizedAt = new Date();
  await prisma.$transaction([
    prisma.applicant.updateMany({
      where: { id: { in: toShortlist.map((a) => a.id) } },
      data: { status: ApplicantStatus.SHORTLISTED },
    }),
    prisma.applicant.updateMany({
      where: { id: { in: toReject.map((a) => a.id) } },
      data: { status: ApplicantStatus.REJECTED_PHASE1 },
    }),
    prisma.campaign.update({
      where: { id: campaignId },
      data: { phaseOneFinalizedAt: finalizedAt },
    }),
  ]);

  await logActivity({
    actorId: gate.userId,
    actionType: "PHASE1_FINALIZED",
    targetType: "Campaign",
    targetId: campaignId,
    details: {
      shortlisted: toShortlist.length,
      rejected: toReject.length,
      stillPending: stillPending.length,
    },
  });

  revalidatePath(`/campaigns/${campaignId}/phase1/selection`);
  revalidatePath(`/campaigns/${campaignId}/applicants`);
  return {
    ok: true,
    shortlisted: toShortlist.length,
    rejected: toReject.length,
    stillPending: stillPending.length,
  };
}

"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { parseTunisLocal } from "@/lib/tunis-time";
import {
  runPhaseOneEmailBatch,
  type SendFailure,
} from "@/lib/phase1-email-batch";
import {
  PHASE_ONE_ACCEPTED as ACCEPTED,
  PHASE_ONE_REJECTED as REJECTED,
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

// ACCEPTED / REJECTED now live in phase1-ranking.ts, so the Phase 2 page's
// "passed Phase 1" population and this file's finalize step read the same
// definition of the outcome rather than each keeping their own list.

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
    campaignId,
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
 * Manually override ONE applicant's classification to MANUAL_ACCEPT /
 * MANUAL_REJECT — available on every row regardless of its current
 * classification, not just TO_DISCUSS ones. A manual decision outranks whatever
 * the algorithm said and, per {@link recalculatePhaseOneRanking}, survives every
 * later recalculation until it is explicitly reverted.
 *
 * Works even if the applicant somehow has no PhaseOneResult yet (upserts one),
 * so an override can never fail for lack of a row to write.
 */
export async function manualOverrideAction(
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
  const previousClassification =
    result?.classification ?? PhaseOneClassification.PENDING;
  const classification =
    outcome === "ACCEPT"
      ? PhaseOneClassification.MANUAL_ACCEPT
      : PhaseOneClassification.MANUAL_REJECT;

  await prisma.phaseOneResult.upsert({
    where: { applicantId },
    create: { applicantId, classification },
    update: { classification },
  });

  await logActivity({
    actorId: gate.userId,
    actionType: "PHASE1_MANUAL_OVERRIDE",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    details: {
      previousClassification,
      newClassification: classification,
      weightedTotal: result?.weightedTotal ?? null,
      rank: result?.rank ?? null,
    },
  });

  revalidatePath(`/campaigns/${campaignId}/phase1/selection`);
  return { ok: true, classification };
}

/**
 * Flag ONE applicant as needing discussion, whatever they are now — an
 * AUTO_ACCEPT the panel wants a second look at, or a MANUAL_REJECT someone wants
 * reopened. Because TO_DISCUSS is sticky in {@link recalculatePhaseOneRanking},
 * this survives every later recalculation until the row is resolved or reverted.
 *
 * Upserts, so it works even on an applicant with no PhaseOneResult row yet.
 */
export async function markToDiscussAction(
  campaignId: string,
  applicantId: string,
): Promise<ActionResult<{ classification: PhaseOneClassification }>> {
  const gate = await authorize(campaignId);
  if (!gate.ok) return gate;

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

  const previousClassification =
    applicant.phaseOneResult?.classification ?? PhaseOneClassification.PENDING;

  await prisma.phaseOneResult.upsert({
    where: { applicantId },
    create: {
      applicantId,
      classification: PhaseOneClassification.TO_DISCUSS,
    },
    update: { classification: PhaseOneClassification.TO_DISCUSS },
  });

  await logActivity({
    actorId: gate.userId,
    actionType: "PHASE1_MARKED_TO_DISCUSS",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    details: { previousClassification },
  });

  revalidatePath(`/campaigns/${campaignId}/phase1/selection`);
  return { ok: true, classification: PhaseOneClassification.TO_DISCUSS };
}

/**
 * Hand an applicant back to algorithmic control. Accepts any sticky row —
 * MANUAL_ACCEPT, MANUAL_REJECT or TO_DISCUSS.
 *
 * TO_DISCUSS is included deliberately: now that a recalculation can move someone
 * INTO that state but never out of it, this is the only route back, and without
 * it a flagged row could never return to automatic control.
 *
 * Clearing to PENDING is only the first half: PENDING means "not yet scored",
 * and a reverted applicant is fully scored, so leaving them there would both
 * mislabel them and block finalization. So the override is cleared and
 * {@link recalculatePhaseOneRanking} is run immediately — with the manual flag
 * gone, that pass classifies this applicant from their real score and rank
 * (AUTO_ACCEPT / TO_DISCUSS / AUTO_REJECT, or PENDING only if genuinely
 * incomplete). Reusing the whole pass rather than reclassifying one row in
 * isolation is deliberate: rank depends on the entire contested set, and the
 * pass already leaves every other manual decision untouched.
 */
export async function revertOverrideAction(
  campaignId: string,
  applicantId: string,
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
  const isSticky =
    result?.classification === PhaseOneClassification.MANUAL_ACCEPT ||
    result?.classification === PhaseOneClassification.MANUAL_REJECT ||
    result?.classification === PhaseOneClassification.TO_DISCUSS;
  if (!result || !isSticky) {
    return {
      ok: false,
      error: "That applicant is already under automatic classification.",
    };
  }

  await prisma.phaseOneResult.update({
    where: { applicantId },
    data: { classification: PhaseOneClassification.PENDING },
  });

  // Now that nothing marks this row as a human decision, the standard pass will
  // classify it from its score/rank like any other applicant.
  const recalculated = await recalculatePhaseOneRanking(campaignId);
  if (!recalculated.ok) return recalculated;

  const reverted = recalculated.rows.find((r) => r.applicantId === applicantId);
  const classification = reverted?.classification ?? PhaseOneClassification.PENDING;

  await logActivity({
    actorId: gate.userId,
    actionType: "PHASE1_OVERRIDE_REVERTED",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    details: {
      previousClassification: result.classification,
      newClassification: classification,
      weightedTotal: reverted?.weightedTotal ?? result.weightedTotal,
      rank: reverted?.rank ?? result.rank,
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
    campaignId,
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

// ============ PHASE 1 RESULT EMAILS ============

/**
 * SEND_EMAILS + campaign exists. Sending results is a separate, higher bar than
 * running the selection itself (SCREEN_PHASE1): a TM reviewer can rank and even
 * finalize, but only a SEND_EMAILS holder actually emails applicants.
 */
async function authorizeEmails(
  campaignId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You are signed out." };

  if (!(await hasPermission(userId, PermissionKey.SEND_EMAILS))) {
    return { ok: false, error: "You don't have permission to send emails." };
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!campaign) return { ok: false, error: "That campaign doesn't exist." };

  return { ok: true, userId };
}

/**
 * Set the campaign's GDG Day date/time + location — the details the acceptance
 * email interpolates. Required before any acceptance email can be sent.
 */
export async function setGdgDayDetailsAction(
  campaignId: string,
  dateTimeLocal: string,
  location: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await authorizeEmails(campaignId);
  if (!gate.ok) return gate;

  const dateTime = parseTunisLocal(dateTimeLocal);
  if (!dateTime) {
    return { ok: false, error: "Enter a valid GDG Day date and time." };
  }
  const trimmedLocation = location.trim();
  if (!trimmedLocation) {
    return { ok: false, error: "Enter a location for GDG Day." };
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { gdgDayDateTime: dateTime, gdgDayLocation: trimmedLocation },
  });

  await logActivity({
    actorId: gate.userId,
    actionType: "GDG_DAY_DETAILS_SET",
    targetType: "Campaign",
    targetId: campaignId,
    campaignId,
    details: { gdgDayDateTime: dateTime.toISOString(), location: trimmedLocation },
  });

  revalidatePath(`/campaigns/${campaignId}/phase1/selection`);
  return { ok: true };
}

/**
 * Batch-send Phase 1 results (acceptances to SHORTLISTED, rejections to
 * REJECTED_PHASE1 cohort applicants). SEND_EMAILS-gated here; the actual work —
 * recipient selection, duplicate-send skipping, per-attempt EmailLog rows and
 * the activity entry — lives in {@link runPhaseOneEmailBatch} so it can be
 * exercised outside a request too. Pass `resend: true` for the explicit,
 * TM-Lead-confirmed re-send to everyone.
 */
export async function sendPhaseOneEmailsAction(
  campaignId: string,
  options?: { resend?: boolean },
): Promise<
  ActionResult<{ sent: number; failed: number; skipped: number; failures: SendFailure[] }>
> {
  const gate = await authorizeEmails(campaignId);
  if (!gate.ok) return gate;

  const result = await runPhaseOneEmailBatch(campaignId, gate.userId, options);
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/phase1/selection`);
  return result;
}

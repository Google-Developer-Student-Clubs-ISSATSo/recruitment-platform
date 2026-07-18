"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import {
  runPhaseOneEmailBatch,
  type SendFailure,
} from "@/lib/phase1-email-batch";
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
 * Clear a manual override, returning the applicant to algorithmic control. Only
 * a MANUAL_ACCEPT / MANUAL_REJECT row can be reverted. The classification is set
 * back to PENDING so the next Recalculate pass reclassifies it from its current
 * score/rank (a complete applicant becomes AUTO_ACCEPT / TO_DISCUSS / AUTO_REJECT
 * again; an incomplete one stays PENDING).
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
  const isManual =
    result?.classification === PhaseOneClassification.MANUAL_ACCEPT ||
    result?.classification === PhaseOneClassification.MANUAL_REJECT;
  if (!result || !isManual) {
    return { ok: false, error: "That applicant has no manual override to revert." };
  }

  await prisma.phaseOneResult.update({
    where: { applicantId },
    data: { classification: PhaseOneClassification.PENDING },
  });

  await logActivity({
    actorId: gate.userId,
    actionType: "PHASE1_OVERRIDE_REVERTED",
    targetType: "Applicant",
    targetId: applicantId,
    details: {
      previousClassification: result.classification,
      newClassification: PhaseOneClassification.PENDING,
      weightedTotal: result.weightedTotal,
      rank: result.rank,
    },
  });

  revalidatePath(`/campaigns/${campaignId}/phase1/selection`);
  return { ok: true, classification: PhaseOneClassification.PENDING };
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

// datetime-local gives wall-clock minutes with no zone ("2026-11-01T15:00").
// The club is in Sousse, so that wall time is always meant as Tunisian local
// time (UTC+1, no DST). Pin the offset explicitly instead of trusting the
// server's TZ, so the stored instant matches what the TM Lead typed.
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function parseTunisLocal(value: string): Date | null {
  if (!LOCAL_DATETIME_RE.test(value)) return null;
  const date = new Date(`${value}:00+01:00`);
  return Number.isNaN(date.getTime()) ? null : date;
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

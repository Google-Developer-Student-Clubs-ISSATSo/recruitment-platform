"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { ApplicantStatus, Committee, PermissionKey } from "@/generated/prisma/enums";
import { CAPACITY_COMMITTEES } from "@/lib/committee-capacity";
import {
  DECISION_STATUS,
  UNDECIDED_STATUSES,
  type FinalDecision,
} from "@/lib/final-decision";
import {
  runFinalResultsBatch,
  type FinalBatchResult,
} from "@/lib/final-email-batch";

// Final decision mutations. Every action is gated by ENTER_FINAL_DECISION
// server-side — the page guard only controls what renders — and scoped to the
// campaignId from the route, so an applicant from another campaign can never be
// decided from this one.

const DECIDE = PermissionKey.ENTER_FINAL_DECISION;

function pathFor(campaignId: string) {
  return `/campaigns/${campaignId}/final-decision`;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Record one decision. Deliberately has no completion or lock check: decisions
 * are freely re-editable, including after the campaign is marked complete, and
 * including re-deciding someone already ACCEPTED or REJECTED_FINAL. The UI asks
 * for an extra confirmation once completed; that is a speed bump, not a rule
 * this action enforces.
 *
 * `committee` is only meaningful for ACCEPT. Reject and Shortlist clear
 * assignedCommittee, so whatever the dropdown happened to show is ignored.
 */
export async function recordDecisionAction(
  campaignId: string,
  applicantId: string,
  decision: FinalDecision,
  committee: Committee | null,
): Promise<ActionResult> {
  const actorId = await requirePermission(DECIDE);

  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: { id: true, campaignId: true, status: true },
  });
  if (!applicant || applicant.campaignId !== campaignId) {
    return { ok: false, error: "That applicant isn't part of this campaign." };
  }

  if (decision === "ACCEPT" && committee === null) {
    return { ok: false, error: "Pick a committee before accepting." };
  }

  const status = DECISION_STATUS[decision];
  const assignedCommittee = decision === "ACCEPT" ? committee : null;
  const previousStatus = applicant.status;

  await prisma.applicant.update({
    where: { id: applicantId },
    data: { status, assignedCommittee },
  });

  await logActivity({
    actorId,
    actionType: "FINAL_DECISION_RECORDED",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    details: { decision, assignedCommittee, previousStatus },
  });

  revalidatePath(pathFor(campaignId));
  return { ok: true };
}

/**
 * Change an applicant's assigned committee without deciding anything. Lets the
 * meeting move an already-accepted person between committees to rebalance
 * capacity, which is otherwise only reachable by re-accepting them.
 */
export async function assignCommitteeAction(
  campaignId: string,
  applicantId: string,
  committee: Committee,
): Promise<ActionResult> {
  const actorId = await requirePermission(DECIDE);

  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: { id: true, campaignId: true, status: true },
  });
  if (!applicant || applicant.campaignId !== campaignId) {
    return { ok: false, error: "That applicant isn't part of this campaign." };
  }
  // Only an accepted applicant holds a committee; for anyone else the dropdown
  // is a draft the Accept button will commit, so there is nothing to write yet.
  if (applicant.status !== ApplicantStatus.ACCEPTED) {
    return { ok: true };
  }

  await prisma.applicant.update({
    where: { id: applicantId },
    data: { assignedCommittee: committee },
  });

  await logActivity({
    actorId,
    actionType: "FINAL_DECISION_RECORDED",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    details: {
      decision: "ACCEPT",
      assignedCommittee: committee,
      previousStatus: applicant.status,
    },
  });

  revalidatePath(pathFor(campaignId));
  return { ok: true };
}

export type CompleteResult =
  | { ok: true; totalAccepted: number; totalRejected: number }
  | { ok: false; error: string };

/**
 * Sign off the meeting. Refuses while anyone is still SHORTLISTED or PENDING —
 * the same condition the button's disabled state expresses, re-checked here so
 * a direct call can't mark an unfinished campaign complete.
 */
export async function completeFinalDecisionsAction(
  campaignId: string,
): Promise<CompleteResult> {
  const actorId = await requirePermission(DECIDE);

  const remaining = await prisma.applicant.count({
    where: { campaignId, status: { in: [...UNDECIDED_STATUSES] } },
  });
  if (remaining > 0) {
    return {
      ok: false,
      error: `${remaining} applicant${remaining === 1 ? " is" : "s are"} still undecided.`,
    };
  }

  const [totalRejected, grouped] = await Promise.all([
    prisma.applicant.count({
      where: { campaignId, status: ApplicantStatus.REJECTED_FINAL },
    }),
    prisma.applicant.groupBy({
      by: ["assignedCommittee"],
      where: { campaignId, status: ApplicantStatus.ACCEPTED },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map(
    grouped
      .filter((g) => g.assignedCommittee !== null)
      .map((g) => [g.assignedCommittee!, g._count._all]),
  );
  const byCommittee = Object.fromEntries(
    CAPACITY_COMMITTEES.map((c) => [c, counts.get(c) ?? 0]),
  ) as Record<Committee, number>;
  const totalAccepted = CAPACITY_COMMITTEES.reduce(
    (sum, c) => sum + byCommittee[c],
    0,
  );

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { finalDecisionCompletedAt: new Date() },
  });

  await logActivity({
    actorId,
    actionType: "FINAL_DECISIONS_COMPLETED",
    targetType: "Campaign",
    targetId: campaignId,
    campaignId,
    details: { totalAccepted, totalRejected, byCommittee },
  });

  revalidatePath(pathFor(campaignId));
  return { ok: true, totalAccepted, totalRejected };
}

/**
 * Batch-send both final-result emails. Gated by SEND_EMAILS — deliberately a
 * different permission from the rest of this page: someone who runs the
 * decision meeting (ENTER_FINAL_DECISION) does not thereby get to mail every
 * applicant their outcome.
 */
export async function sendFinalResultsAction(
  campaignId: string,
): Promise<FinalBatchResult> {
  const actorId = await requirePermission(PermissionKey.SEND_EMAILS);
  const result = await runFinalResultsBatch(campaignId, actorId);
  revalidatePath(pathFor(campaignId));
  return result;
}

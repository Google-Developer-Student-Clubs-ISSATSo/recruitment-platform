import { cache } from "react";

import { prisma } from "@/lib/prisma";
import {
  ApplicantStatus,
  PhaseOneClassification,
  type Committee,
} from "@/generated/prisma/enums";
import { CAPACITY_COMMITTEES } from "@/lib/committee-capacity";
import { NOTE_FIELDS } from "@/lib/interview-note";

// The single definition of every campaign-level number the app reports.
//
// This module is the shared source for BOTH the Statistics page and the
// dashboard's pipeline funnel — the funnel imports `getCampaignCounts` and
// `countInterviewed` from here rather than keeping its own copy, so the two
// screens cannot drift into quoting different totals for the same campaign.
//
// Everything is COUNTED on read from the applicant / result rows themselves;
// nothing is stored and re-read. Same reasoning as CommitteeCapacity keeping no
// accepted counter and InterviewNote keeping no average: a stored figure drifts
// the moment a row changes by a path that forgot to update it.
//
// Each loader is wrapped in React's `cache`, so one render pays for one query
// however many widgets read the same figure.

/**
 * Every status that means "passed Phase 1". Deliberately spelled out rather
 * than tested as "not SUBMITTED and not REJECTED_PHASE1", because the counts
 * below derive the passed figure by subtraction — see {@link getCampaignCounts}
 * — so a status added to the enum later lands in the passed bucket
 * automatically instead of silently vanishing from the totals.
 */
export const PHASE_ONE_PASSED_STATUSES: readonly ApplicantStatus[] = [
  ApplicantStatus.SHORTLISTED,
  ApplicantStatus.INVITED_GDG_DAY,
  ApplicantStatus.INTERVIEW_SCHEDULED,
  ApplicantStatus.ACCEPTED,
  ApplicantStatus.PENDING,
  ApplicantStatus.REJECTED_FINAL,
];

export type CampaignCounts = {
  /** Every applicant in the campaign. */
  total: number;
  /** Still awaiting a Phase 1 verdict. */
  submitted: number;
  /**
   * Passed Phase 1 — cumulative, so an applicant who has since been
   * interviewed, accepted or rejected at the final stage still counts here.
   * `submitted + shortlisted + rejectedPhaseOne === total`, always.
   */
  shortlisted: number;
  /** Rejected at Phase 1, for any reason. */
  rejectedPhaseOne: number;
  /** Rejected at the final decision meeting. */
  rejectedFinal: number;
  /** Accepted into a committee. */
  accepted: number;
};

/** Per-status applicant counts for one campaign, in a single grouped query. */
export const getCampaignCounts = cache(async function getCampaignCounts(
  campaignId: string,
): Promise<CampaignCounts> {
  const grouped = await prisma.applicant.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });

  const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
  const count = (status: ApplicantStatus) => byStatus.get(status) ?? 0;

  const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
  const submitted = count(ApplicantStatus.SUBMITTED);
  const rejectedPhaseOne = count(ApplicantStatus.REJECTED_PHASE1);

  return {
    total,
    submitted,
    // By subtraction, so the three buckets always add up to the pool size even
    // if a new downstream status appears in the enum.
    shortlisted: total - submitted - rejectedPhaseOne,
    rejectedPhaseOne,
    rejectedFinal: count(ApplicantStatus.REJECTED_FINAL),
    accepted: count(ApplicantStatus.ACCEPTED),
  };
});

/**
 * How many applicants have actually been interviewed.
 *
 * "Interviewed" means an InterviewNote carrying at least one of the seven
 * ratings — the same test `interviewAverage` uses to decide whether an
 * applicant has an interview score at all. A note row created but never filled
 * in is not an interview, and neither definition should be able to drift from
 * the other, so both read off NOTE_FIELDS.
 */
export const countInterviewed = cache(async function countInterviewed(
  campaignId: string,
): Promise<number> {
  return prisma.interviewNote.count({
    where: {
      applicant: { campaignId },
      OR: NOTE_FIELDS.map((f) => ({ [f.key]: { not: null } })),
    },
  });
});

/** One committee's applicant count, for the distribution charts. */
export type CommitteeCount = { committee: Committee; count: number };

/**
 * How Phase 1 ended for the applicants who were actually scored.
 *
 * The two MANUAL_* figures are the interesting ones: they are the cases the
 * rubric flagged TO_DISCUSS and a human then resolved, so together they measure
 * how much of Phase 1 the thresholds could not decide on their own.
 */
export type PhaseOneOutcomeCounts = {
  autoAccept: number;
  manualAccept: number;
  autoReject: number;
  manualReject: number;
  /**
   * Scored applicants whose result is still PENDING or TO_DISCUSS — no verdict
   * yet. Tracked so the four resolved buckets can be shown without the reader
   * wondering why they don't add up to the scored pool.
   */
  unresolved: number;
};

export type CampaignStatistics = {
  totalApplicants: number;
  /**
   * Rejected at Phase 1 with no PhaseOneResult row at all. That absence is what
   * identifies them: the CSV import creates a result row only for scoreable
   * applicants, so a REJECTED_PHASE1 applicant without one was auto-rejected on
   * import for not being an ISSATSO student and never entered scoring.
   */
  autoRejectedNonIssatso: number;
  /** Rejected at Phase 1 *with* a result row — a genuine score-based rejection. */
  phase1ScoreRejected: number;
  /** Rejected at the final decision meeting. */
  finalStageRejected: number;
  accepted: number;
  /**
   * Passed Phase 1, over the pool that actually entered scoring (total minus the
   * non-ISSATSO auto-rejects). Deliberately not over the whole pool: including
   * applicants who were never eligible to be scored would dilute the rate into
   * a measure of import quality rather than of screening.
   *
   * Null when nobody entered scoring at all.
   */
  phase1PassRate: number | null;
  /**
   * Accepted over everyone who reached a final verdict. Anyone still PENDING is
   * excluded from both sides — they are an open question, not a rejection, and
   * counting them as one would understate the rate mid-meeting.
   *
   * Null when no final decision has been recorded yet.
   */
  finalAcceptanceRate: number | null;
  /** Every applicant, by the committee they asked for. */
  applicantsByPreferredCommittee: CommitteeCount[];
  /** Only ACCEPTED applicants — nobody else carries an assigned committee. */
  applicantsByAssignedCommittee: CommitteeCount[];
  phase1OutcomeBreakdown: PhaseOneOutcomeCounts;
};

/** Fill in every committee at 0 so a chart's categories never move or vanish. */
function toCommitteeCounts(
  rows: { committee: Committee | null; count: number }[],
): CommitteeCount[] {
  const found = new Map(
    rows
      .filter((r) => r.committee !== null)
      .map((r) => [r.committee as Committee, r.count]),
  );
  // CAPACITY_COMMITTEES is the app's fixed MKT → TM → EER display order.
  return CAPACITY_COMMITTEES.map((committee) => ({
    committee,
    count: found.get(committee) ?? 0,
  }));
}

/** A rate, or null when the denominator is zero (no data rather than 0%). */
function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export const getCampaignStatistics = cache(async function getCampaignStatistics(
  campaignId: string,
): Promise<CampaignStatistics> {
  const [counts, autoRejectedNonIssatso, preferred, assigned, classifications] =
    await Promise.all([
      getCampaignCounts(campaignId),

      // The defining test for a non-ISSATSO auto-reject: rejected at Phase 1
      // with no result row, because the import never made one for them.
      prisma.applicant.count({
        where: {
          campaignId,
          status: ApplicantStatus.REJECTED_PHASE1,
          phaseOneResult: { is: null },
        },
      }),

      prisma.applicant.groupBy({
        by: ["preferredCommittee"],
        where: { campaignId },
        _count: { _all: true },
      }),

      prisma.applicant.groupBy({
        by: ["assignedCommittee"],
        where: { campaignId, assignedCommittee: { not: null } },
        _count: { _all: true },
      }),

      prisma.phaseOneResult.groupBy({
        by: ["classification"],
        where: { applicant: { campaignId } },
        _count: { _all: true },
      }),
    ]);

  const byClassification = new Map(
    classifications.map((c) => [c.classification, c._count._all]),
  );
  const classified = (c: PhaseOneClassification) =>
    byClassification.get(c) ?? 0;
  const scoredTotal = classifications.reduce(
    (sum, c) => sum + c._count._all,
    0,
  );

  const autoAccept = classified(PhaseOneClassification.AUTO_ACCEPT);
  const manualAccept = classified(PhaseOneClassification.MANUAL_ACCEPT);
  const autoReject = classified(PhaseOneClassification.AUTO_REJECT);
  const manualReject = classified(PhaseOneClassification.MANUAL_REJECT);

  // The scored pool: everyone except those the import rejected before scoring.
  const enteredScoring = counts.total - autoRejectedNonIssatso;

  return {
    totalApplicants: counts.total,
    autoRejectedNonIssatso,
    // By subtraction from the Phase 1 rejections, so the two halves always add
    // back up to `rejectedPhaseOne` — a separate count could disagree with it.
    phase1ScoreRejected: counts.rejectedPhaseOne - autoRejectedNonIssatso,
    finalStageRejected: counts.rejectedFinal,
    accepted: counts.accepted,
    phase1PassRate: rate(counts.shortlisted, enteredScoring),
    finalAcceptanceRate: rate(
      counts.accepted,
      counts.accepted + counts.rejectedFinal,
    ),
    applicantsByPreferredCommittee: toCommitteeCounts(
      preferred.map((p) => ({
        committee: p.preferredCommittee,
        count: p._count._all,
      })),
    ),
    applicantsByAssignedCommittee: toCommitteeCounts(
      assigned.map((a) => ({
        committee: a.assignedCommittee,
        count: a._count._all,
      })),
    ),
    phase1OutcomeBreakdown: {
      autoAccept,
      manualAccept,
      autoReject,
      manualReject,
      unresolved:
        scoredTotal - autoAccept - manualAccept - autoReject - manualReject,
    },
  };
});

/** A rate as a whole-percent string, or an em dash when it is undefined. */
export function formatRate(value: number | null, digits = 1): string {
  return value === null ? "—" : `${(value * 100).toFixed(digits)}%`;
}

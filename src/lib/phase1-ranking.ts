import { prisma } from "@/lib/prisma";
import { computeWeightedTotal } from "@/lib/phase1-score";
import {
  ApplicantStatus,
  PhaseOneClassification,
} from "@/generated/prisma/enums";

/**
 * Which applicants Phase 1 selection owns, as a Prisma `where` fragment.
 *
 * SUBMITTED alone isn't enough: finalizing rewrites every complete applicant to
 * SHORTLISTED / REJECTED_PHASE1, so a SUBMITTED-only query would see an empty
 * pool the moment Phase 1 is finalized — yet the page must keep rendering and
 * stay re-finalizable after that point.
 *
 * But "any SHORTLISTED/REJECTED_PHASE1 applicant" is too broad the other way:
 * it would sweep in anyone parked at those statuses by some other route, who
 * would then sit in the ranking as permanently incomplete. The distinguishing
 * mark of an applicant a Phase 1 decision actually placed is a PhaseOneResult
 * row — finalize only ever writes statuses for applicants that have one.
 *
 * An applicant past Phase 1 entirely (INVITED_GDG_DAY and beyond) is no longer
 * ours and drops out either way.
 */
export function phaseOneCohortWhere(campaignId: string) {
  return {
    campaignId,
    OR: [
      { status: ApplicantStatus.SUBMITTED },
      {
        status: {
          in: [ApplicantStatus.SHORTLISTED, ApplicantStatus.REJECTED_PHASE1],
        },
        phaseOneResult: { isNot: null },
      },
    ],
  };
}

/**
 * The classifications that mean "passed Phase 1".
 *
 * AUTO_ACCEPT is the algorithm's top-N cut; MANUAL_ACCEPT is a human resolving
 * a case by hand (a PENDING or TO_DISCUSS row someone accepted) and is exactly
 * how a manual accept is distinguished in the data — `manualOverrideAction`
 * writes it, and it is sticky, so recalculation never reverts it. Bare PENDING
 * is NOT a pass: it means "above the threshold but outside the top N, awaiting
 * human review", or "not fully scored yet".
 *
 * Typed as the full enum so `.includes()` accepts any classification — the
 * inferred literal-union element type would reject everything else.
 */
export const PHASE_ONE_ACCEPTED: readonly PhaseOneClassification[] = [
  PhaseOneClassification.AUTO_ACCEPT,
  PhaseOneClassification.MANUAL_ACCEPT,
];

/** The mirror image: the two ways an applicant is out after Phase 1. */
export const PHASE_ONE_REJECTED: readonly PhaseOneClassification[] = [
  PhaseOneClassification.AUTO_REJECT,
  PhaseOneClassification.MANUAL_REJECT,
];

/**
 * "Passed Phase 1", as a Prisma `where` fragment — the Phase 2 population.
 *
 * Keyed on the CLASSIFICATION, not on Applicant.status. Finalizing writes
 * SHORTLISTED for exactly this set, but status keeps moving forward afterwards
 * (INTERVIEW_SCHEDULED, ACCEPTED, REJECTED_FINAL), so a status-based filter
 * would empty this page the moment interviews begin. The classification is the
 * durable record of the Phase 1 outcome itself.
 *
 * Note this intentionally does NOT require finalization to have run: an
 * AUTO_ACCEPT/MANUAL_ACCEPT applicant is someone Phase 1 passed whether or not
 * the commit button has been pressed yet.
 */
export function passedPhaseOneWhere(campaignId: string) {
  return {
    campaignId,
    // Spread because Prisma's generated `in` filter wants a mutable array.
    phaseOneResult: { is: { classification: { in: [...PHASE_ONE_ACCEPTED] } } },
  };
}

/**
 * Classifications a recalculation must never overwrite.
 *
 * MANUAL_ACCEPT / MANUAL_REJECT are decisions a human already made. TO_DISCUSS
 * is the flag that a human still *needs* to decide — it now only ever gets there
 * by someone marking it explicitly (the automatic buffer banding that used to
 * assign it is gone), and clearing it automatically would lose the fact that a
 * human flagged the row. It persists until a human resolves it (Accept/Reject)
 * or explicitly reverts it.
 */
const STICKY_CLASSIFICATIONS: readonly PhaseOneClassification[] = [
  PhaseOneClassification.MANUAL_ACCEPT,
  PhaseOneClassification.MANUAL_REJECT,
  PhaseOneClassification.TO_DISCUSS,
];

function isSticky(c: PhaseOneClassification): boolean {
  return STICKY_CLASSIFICATIONS.includes(c);
}

export type RankedApplicant = {
  applicantId: string;
  fullName: string;
  weightedTotal: number | null;
  rank: number | null;
  classification: PhaseOneClassification;
  complete: boolean;
};

export type RecalculateResult =
  | {
      ok: true;
      /** Fully-scored applicants — the only ones that get ranked/classified. */
      completeCount: number;
      /** Applicants missing at least one active question's score. */
      incompleteCount: number;
      rows: RankedApplicant[];
    }
  | { ok: false; error: string };

/**
 * Recompute weighted totals, ranks and algorithmic classifications for a
 * campaign's Phase 1 pool.
 *
 * Shape of the pass (no automatic buffer/TO_DISCUSS banding — that is gone):
 *   - "Complete" means the applicant has a PhaseOneScore for EVERY active
 *     question. Incomplete applicants stay PENDING with a null rank and take no
 *     part in ranking — real-world scoring may never reach 100%, so they are
 *     left behind rather than blocking the others.
 *   - Complete applicants scoring below rejectThreshold are AUTO_REJECT and are
 *     not ranked (rank is only meaningful inside the contested set).
 *   - The rest (complete, at or above the threshold) are sorted by weightedTotal
 *     descending and ranked 1..M. Of those, the TOP `targetCount` become
 *     AUTO_ACCEPT; everyone else above the threshold becomes PENDING — which
 *     here means "awaiting human review", NOT an error or an unscored row. Those
 *     PENDING applicants stay in the pool for the TM team to mark To Discuss,
 *     Accept or Reject by hand.
 *
 * So a fully-scored applicant only ever comes out of this pass as AUTO_ACCEPT,
 * AUTO_REJECT or PENDING. Crucially, AUTO_REJECT is assigned solely on
 * weightedTotal < rejectThreshold, so nobody scoring at or above the threshold
 * is ever auto-rejected — the worst an above-threshold applicant gets is PENDING.
 *
 * MANUAL_ACCEPT / MANUAL_REJECT / TO_DISCUSS survive every recalculation — the
 * first two because a human already decided, TO_DISCUSS because a human still
 * has to. They are skipped by the banding above but still consume a rank: rank
 * reflects where a score placed, which stays true whoever decided the outcome.
 * They do NOT consume an AUTO_ACCEPT slot — the top-`targetCount` cut is taken
 * over the non-sticky applicants only, matching "among the rest".
 *
 * Ties on weightedTotal are broken by name, then id — arbitrary, but stable
 * across runs, so a tie straddling the accept cut can't flip classification on
 * an otherwise no-op recalculation.
 */
export async function recalculatePhaseOneRanking(
  campaignId: string,
): Promise<RecalculateResult> {
  const [config, activeQuestions, applicants] = await Promise.all([
    prisma.phaseOneConfig.findUnique({
      where: { campaignId },
      select: { rejectThreshold: true, targetCount: true },
    }),
    prisma.phaseOneQuestion.findMany({
      where: { campaignId, isActive: true },
      select: { id: true, coefficient: true },
    }),
    prisma.applicant.findMany({
      where: phaseOneCohortWhere(campaignId),
      select: {
        id: true,
        fullName: true,
        phaseOneScores: { select: { questionId: true, value: true } },
        phaseOneResult: { select: { classification: true } },
      },
    }),
  ]);

  if (!config || config.rejectThreshold === null || config.targetCount === null) {
    return {
      ok: false,
      error:
        "This campaign has no reject threshold / target count configured yet. Set them in Configuration → Scoring first.",
    };
  }
  if (activeQuestions.length === 0) {
    return { ok: false, error: "This campaign has no active questions to score." };
  }

  const { rejectThreshold, targetCount } = config;

  // Derive completeness + weighted total from the active questions only, via the
  // shared formula in phase1-score.ts. A score row for a since-deactivated
  // question is never looked up, so it counts for neither.
  const derived = applicants.map((a) => {
    const byQuestion = new Map(
      a.phaseOneScores.map((s) => [s.questionId, s.value]),
    );
    const { total, scoredCount } = computeWeightedTotal(activeQuestions, (id) =>
      byQuestion.get(id),
    );
    return {
      applicantId: a.id,
      fullName: a.fullName,
      complete: scoredCount === activeQuestions.length,
      weightedTotal: total,
      existing: a.phaseOneResult?.classification ?? PhaseOneClassification.PENDING,
    };
  });

  // The contested set: complete AND at or above the reject threshold. Only
  // these are ranked and banded.
  const contested = derived
    .filter((d) => d.complete && d.weightedTotal >= rejectThreshold)
    .sort(
      (x, y) =>
        y.weightedTotal - x.weightedTotal ||
        x.fullName.localeCompare(y.fullName) ||
        x.applicantId.localeCompare(y.applicantId),
    );

  const rankByApplicant = new Map<string, number>();
  contested.forEach((d, i) => rankByApplicant.set(d.applicantId, i + 1));

  // The AUTO_ACCEPT slots go to the top `targetCount` of the contested set,
  // counting only NON-sticky applicants ("among the rest"). Sticky rows keep
  // their manual/to-discuss classification and don't burn a slot. Walk the
  // already-sorted contested set and mark the first `targetCount` eligible ones.
  const autoAccept = new Set<string>();
  for (const d of contested) {
    if (isSticky(d.existing)) continue;
    if (autoAccept.size >= targetCount) break;
    autoAccept.add(d.applicantId);
  }

  const rows: RankedApplicant[] = derived.map((d) => {
    const rank = rankByApplicant.get(d.applicantId) ?? null;

    // A human decision — or a pending-discussion one — is preserved as-is.
    if (isSticky(d.existing)) {
      return {
        applicantId: d.applicantId,
        fullName: d.fullName,
        weightedTotal: d.weightedTotal,
        rank,
        classification: d.existing,
        complete: d.complete,
      };
    }

    let classification: PhaseOneClassification;
    if (!d.complete) {
      // Not yet fully scored — genuinely "pending scoring".
      classification = PhaseOneClassification.PENDING;
    } else if (d.weightedTotal < rejectThreshold) {
      // Below the threshold — the only route to AUTO_REJECT.
      classification = PhaseOneClassification.AUTO_REJECT;
    } else if (autoAccept.has(d.applicantId)) {
      classification = PhaseOneClassification.AUTO_ACCEPT;
    } else {
      // Above the threshold but outside the top N — awaiting human review.
      classification = PhaseOneClassification.PENDING;
    }

    return {
      applicantId: d.applicantId,
      fullName: d.fullName,
      weightedTotal: d.weightedTotal,
      rank,
      classification,
      complete: d.complete,
    };
  });

  // One transaction so a partially-reclassified pool is never observable.
  await prisma.$transaction(
    rows.map((r) =>
      prisma.phaseOneResult.upsert({
        where: { applicantId: r.applicantId },
        create: {
          applicantId: r.applicantId,
          weightedTotal: r.weightedTotal,
          rank: r.rank,
          classification: r.classification,
        },
        update: {
          weightedTotal: r.weightedTotal,
          rank: r.rank,
          classification: r.classification,
        },
      }),
    ),
  );

  return {
    ok: true,
    completeCount: derived.filter((d) => d.complete).length,
    incompleteCount: derived.filter((d) => !d.complete).length,
    rows,
  };
}

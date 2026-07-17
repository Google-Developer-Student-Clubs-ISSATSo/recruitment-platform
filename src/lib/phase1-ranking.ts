import { prisma } from "@/lib/prisma";
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

/** Classifications that represent a human decision, never overwritten below. */
const MANUAL_CLASSIFICATIONS: readonly PhaseOneClassification[] = [
  PhaseOneClassification.MANUAL_ACCEPT,
  PhaseOneClassification.MANUAL_REJECT,
];

function isManual(c: PhaseOneClassification): boolean {
  return MANUAL_CLASSIFICATIONS.includes(c);
}

/** The buffer band half-width around targetCount, in ranks. */
export function bufferFor(targetCount: number): number {
  return Math.max(2, Math.round(targetCount * 0.15));
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
 * Shape of the pass:
 *   - "Complete" means the applicant has a PhaseOneScore for EVERY active
 *     question. Incomplete applicants stay PENDING with a null rank and take no
 *     part in ranking — real-world scoring may never reach 100%, so they are
 *     left behind rather than blocking the others.
 *   - Complete applicants scoring below rejectThreshold are AUTO_REJECT and are
 *     not ranked (rank is only meaningful inside the contested set).
 *   - The rest are sorted by weightedTotal descending and ranked 1..M, then
 *     banded around targetCount by `buffer`:
 *       rank <= target - buffer                    → AUTO_ACCEPT
 *       target - buffer < rank <= target + buffer  → TO_DISCUSS
 *       rank > target + buffer                     → AUTO_REJECT
 *
 * MANUAL_ACCEPT / MANUAL_REJECT are human decisions and survive every
 * recalculation, even when the band would now say otherwise. They do still
 * consume a rank: rank reflects where a score placed, which stays true whoever
 * decided the outcome. Dropping them from the ordering instead would pull the
 * applicants below them up into the buffer band, so recalculating after a few
 * resolutions would resurrect already-rejected candidates into TO_DISCUSS.
 *
 * Ties on weightedTotal are broken by name, then id — arbitrary, but stable
 * across runs, so a tie straddling a band boundary can't flip classification on
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
  const buffer = bufferFor(targetCount);
  const coeffById = new Map(activeQuestions.map((q) => [q.id, q.coefficient]));
  const activeIds = new Set(activeQuestions.map((q) => q.id));

  // Derive completeness + weighted total from the active questions only. A
  // score row for a since-deactivated question counts for neither.
  const derived = applicants.map((a) => {
    const activeScores = a.phaseOneScores.filter((s) => activeIds.has(s.questionId));
    const weightedTotal = activeScores.reduce(
      (sum, s) => sum + s.value * (coeffById.get(s.questionId) ?? 0),
      0,
    );
    return {
      applicantId: a.id,
      fullName: a.fullName,
      complete: activeScores.length === activeQuestions.length,
      weightedTotal,
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

  const rows: RankedApplicant[] = derived.map((d) => {
    const rank = rankByApplicant.get(d.applicantId) ?? null;

    // A human decision outranks anything the bands would say.
    if (isManual(d.existing)) {
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
      classification = PhaseOneClassification.PENDING;
    } else if (rank === null) {
      // Complete but below the threshold — never reaches the bands.
      classification = PhaseOneClassification.AUTO_REJECT;
    } else if (rank <= targetCount - buffer) {
      classification = PhaseOneClassification.AUTO_ACCEPT;
    } else if (rank <= targetCount + buffer) {
      classification = PhaseOneClassification.TO_DISCUSS;
    } else {
      classification = PhaseOneClassification.AUTO_REJECT;
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

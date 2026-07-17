import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";
import { phaseOneCohortWhere, bufferFor } from "@/lib/phase1-ranking";
import { PhaseOneClassification } from "@/generated/prisma/enums";
import { SelectionClient, type SelectionRow } from "./SelectionClient";

// Phase 1 Selection & Ranking. Reads the *persisted* PhaseOneResult rows — it
// never recalculates on load. Ranking is an explicit, logged act by the TM
// Lead, so what's on screen is always the last state someone committed to, not
// a figure that quietly changes underfoot between visits.
//
// Gated by SCREEN_PHASE1 alone (see CAMPAIGN_PAGE_PERMISSIONS["phase1/selection"]):
// narrower than the scoring queue, which also admits the technical-only scorer.
export default async function Phase1SelectionPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;

  await requirePermission(CAMPAIGN_PAGE_PERMISSIONS["phase1/selection"], {
    redirectTo: `/campaigns/${campaignId}/dashboard?denied=1`,
  });

  const [campaign, config, activeQuestions, applicants] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { phaseOneFinalizedAt: true },
    }),
    prisma.phaseOneConfig.findUnique({
      where: { campaignId },
      select: { rejectThreshold: true, targetCount: true },
    }),
    prisma.phaseOneQuestion.findMany({
      where: { campaignId, isActive: true },
      select: { id: true },
    }),
    prisma.applicant.findMany({
      where: phaseOneCohortWhere(campaignId),
      select: {
        id: true,
        fullName: true,
        phaseOneScores: { select: { questionId: true } },
        phaseOneResult: {
          select: { weightedTotal: true, rank: true, classification: true },
        },
      },
    }),
  ]);

  // Completeness is recomputed here rather than read from a column so the
  // "still incomplete" line stays honest between recalculations — someone may
  // have scored an applicant since the last ranking pass.
  const activeIds = new Set(activeQuestions.map((q) => q.id));
  const activeQuestionCount = activeQuestions.length;

  const rows: SelectionRow[] = applicants.map((a) => {
    const scored = a.phaseOneScores.filter((s) => activeIds.has(s.questionId)).length;
    return {
      applicantId: a.id,
      fullName: a.fullName,
      weightedTotal: a.phaseOneResult?.weightedTotal ?? null,
      rank: a.phaseOneResult?.rank ?? null,
      classification:
        a.phaseOneResult?.classification ?? PhaseOneClassification.PENDING,
      complete: scored === activeQuestionCount && activeQuestionCount > 0,
    };
  });

  return (
    <SelectionClient
      campaignId={campaignId}
      initialRows={rows}
      targetCount={config?.targetCount ?? null}
      rejectThreshold={config?.rejectThreshold ?? null}
      buffer={config?.targetCount != null ? bufferFor(config.targetCount) : null}
      finalizedAtISO={campaign?.phaseOneFinalizedAt?.toISOString() ?? null}
    />
  );
}

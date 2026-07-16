import { prisma } from "@/lib/prisma";
import { ScoringConfigManager } from "./scoring/ScoringConfigManager";
import { PhaseOneConfigForm } from "./scoring/PhaseOneConfigForm";
import type { QuestionDTO } from "./scoring/actions";

// Server data-loader for the Phase 1 screening/scoring configuration. Rendered
// only for CONFIGURE_SCREENING holders (the <PermissionGate> in page.tsx). All
// reads here are scoped to the campaignId from the route, so a rubric or config
// from another campaign can never appear.
export async function ScoringConfigSection({
  campaignId,
}: {
  campaignId: string;
}) {
  const [rows, config] = await Promise.all([
    prisma.phaseOneQuestion.findMany({
      where: { campaignId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        text: true,
        coefficient: true,
        noteScale: true,
        order: true,
        isActive: true,
        requiresTechnicalScorer: true,
        _count: { select: { scores: true } },
      },
    }),
    prisma.phaseOneConfig.findUnique({
      where: { campaignId },
      select: { rejectThreshold: true, targetCount: true },
    }),
  ]);

  const questions: QuestionDTO[] = rows.map((q) => ({
    id: q.id,
    text: q.text,
    coefficient: q.coefficient,
    noteScale: q.noteScale,
    order: q.order,
    isActive: q.isActive,
    requiresTechnicalScorer: q.requiresTechnicalScorer,
    scoreCount: q._count.scores,
  }));

  return (
    <div className="space-y-6">
      <ScoringConfigManager
        campaignId={campaignId}
        initialQuestions={questions}
      />
      <PhaseOneConfigForm
        campaignId={campaignId}
        rejectThreshold={config?.rejectThreshold ?? null}
        targetCount={config?.targetCount ?? null}
      />
    </div>
  );
}

import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import { formatTunisDateTime } from "@/lib/tunis-time";
import { phaseOneCohortWhere } from "@/lib/phase1-ranking";
import { Phase1ScoringClient } from "./Phase1ScoringClient";
import type { Phase1Applicant, Phase1Question, ViewMode } from "./types";

// Keys the technical-only payload is sent to the client under. The client reads
// these exact names, so they stay fixed — they are NOT the form's headers.
const GITHUB_FIELD = "GitHub link";
const LINKEDIN_FIELD = "LinkedIn link";
const SOFT_SKILLS_FIELD = "Soft skills";
const OTHER_SKILLS_FIELD = "Other skills";

// rawFormData is stored under the Google Form's exact question titles
// (e.g. "Github Profile Link:", "Your soft skills: "), which change from one
// form to the next. So instead of an exact-key lookup, find the stored key whose
// normalised form (lowercase, letters/digits only) contains the needle.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function pick(raw: Record<string, unknown>, needle: string): string | null {
  const key = Object.keys(raw).find((k) => norm(k).includes(needle));
  const v = key ? raw[key] : null;
  return typeof v === "string" && v.trim() ? v : null;
}

// Phase 1 Scoring Queue. Data entry only — reviewers and the Technical Scorer
// enter scores; ranking/auto-classification is a later stage. Everything is
// scoped to the campaignId in the route.
//
// Page guard: SCREEN_PHASE1 *or* ENTER_TECHNICAL_SCORE (the phase1 entry in
// CAMPAIGN_PAGE_PERMISSIONS). Two viewer states follow:
//   - "full"           — holds SCREEN_PHASE1 (regardless of ENTER_TECHNICAL_SCORE)
//   - "technical-only" — holds ENTER_TECHNICAL_SCORE but NOT SCREEN_PHASE1
// The technical-only payload is stripped ON THE SERVER to name + GitHub +
// LinkedIn + Soft skills + Other skills and the single Technical question —
// the other answers/questions never reach that client. A user with neither
// permission is bounced.
export default async function Phase1Page({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [canScreen, canTechnical] = await Promise.all([
    hasPermission(userId, PermissionKey.SCREEN_PHASE1),
    hasPermission(userId, PermissionKey.ENTER_TECHNICAL_SCORE),
  ]);
  if (!canScreen && !canTechnical) {
    redirect(`/campaigns/${campaignId}/dashboard?denied=1`);
  }

  const viewMode: ViewMode = canScreen ? "full" : "technical-only";

  const [campaign, questionRows, applicantRows] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { phaseOneFinalizedAt: true },
    }),
    prisma.phaseOneQuestion.findMany({
      where: { campaignId, isActive: true },
      orderBy: { order: "asc" },
      select: {
        id: true,
        text: true,
        coefficient: true,
        noteScale: true,
        order: true,
        requiresTechnicalScorer: true,
        sourceField: true,
      },
    }),
    prisma.applicant.findMany({
      // The WHOLE Phase 1 cohort, not just the not-yet-scored: once the phase
      // is finalized, the queue must keep rendering everyone the outcome was
      // written for (the cohort rules live in phase1-ranking.ts, shared with
      // the Selection page) — read-only, so nothing already committed can be
      // quietly adjusted afterwards.
      where: phaseOneCohortWhere(campaignId),
      // Submission order, first submitted → last — the same order the
      // Applicants page renders, so reviewers work the form in the order it
      // arrived. fullName is the tiebreak for same-instant import batches.
      orderBy: [{ createdAt: "asc" }, { fullName: "asc" }],
      select: {
        id: true,
        fullName: true,
        rawFormData: true,
        phaseOneScores: { select: { questionId: true, value: true } },
        phaseOneResult: { select: { weightedTotal: true } },
        // The shared screening note. Read unconditionally here and handed to
        // the client ONLY in full mode below — the technical-only payload
        // strips it, same rule as the answers behind it.
        phaseOneNote: { select: { text: true } },
      },
    }),
  ]);

  const activeQuestions: Phase1Question[] = questionRows;
  const activeIds = new Set(activeQuestions.map((q) => q.id));
  const technical =
    activeQuestions.find((q) => q.requiresTechnicalScorer) ?? null;

  // What the client renders controls for: everything for full reviewers, ONLY
  // the Technical question for the technical-only viewer (so no other question
  // text is even sent).
  const questionsForClient =
    viewMode === "full" ? activeQuestions : technical ? [technical] : [];

  const applicants: Phase1Applicant[] = applicantRows.map((a) => {
    const activeScores = a.phaseOneScores.filter((s) =>
      activeIds.has(s.questionId),
    );
    const scoredCount = activeScores.length; // across all active questions

    if (viewMode === "full") {
      const scores: Record<string, number> = {};
      for (const s of activeScores) scores[s.questionId] = s.value;
      return {
        id: a.id,
        fullName: a.fullName,
        rawFormData: (a.rawFormData ?? null) as Record<string, unknown> | null,
        scores,
        scoredCount,
        weightedTotal: a.phaseOneResult?.weightedTotal ?? null,
        note: a.phaseOneNote?.text ?? null,
      };
    }

    // technical-only: hand the client only what it's allowed to see. The other
    // answers and their scores are dropped here, server-side.
    const raw = (a.rawFormData ?? {}) as Record<string, unknown>;
    const restricted: Record<string, unknown> = {
      [GITHUB_FIELD]: pick(raw, "github"),
      [LINKEDIN_FIELD]: pick(raw, "linkedin"),
      [SOFT_SKILLS_FIELD]: pick(raw, "softskills"),
      [OTHER_SKILLS_FIELD]: pick(raw, "otherskills"),
    };
    const scores: Record<string, number> = {};
    if (technical) {
      const ts = activeScores.find((s) => s.questionId === technical.id);
      if (ts) scores[technical.id] = ts.value;
    }
    return {
      id: a.id,
      fullName: a.fullName,
      rawFormData: restricted,
      scores,
      scoredCount,
      weightedTotal: null, // aggregate total is not exposed to this viewer
    };
  });

  // Phase 1 finalized? Scores and notes are then locked for EVERYONE — the
  // cohort stays visible, read-only. Server-formatted for the banner.
  const finalizedAt = campaign?.phaseOneFinalizedAt ?? null;
  const finalized = finalizedAt != null;

  return (
    <Phase1ScoringClient
      campaignId={campaignId}
      viewMode={viewMode}
      finalized={finalized}
      finalizedLabel={finalizedAt ? formatTunisDateTime(finalizedAt) : null}
      questions={questionsForClient}
      totalQuestions={activeQuestions.length}
      initialApplicants={applicants}
      caps={{ canScreen, canTechnical }}
    />
  );
}

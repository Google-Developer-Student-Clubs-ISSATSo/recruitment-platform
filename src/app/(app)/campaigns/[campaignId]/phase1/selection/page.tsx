import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";
import { phaseOneCohortWhere } from "@/lib/phase1-ranking";
import { PHASE1_TEMPLATE } from "@/lib/phase1-email-templates";
import { tunisInputValue } from "@/lib/tunis-time";
import { formatGdgDayDateTime } from "@/emails/PhaseOneAcceptanceEmail";
import {
  ApplicantStatus,
  PermissionKey,
  PhaseOneClassification,
} from "@/generated/prisma/enums";
import { SelectionClient, type SelectionRow } from "./SelectionClient";
import { EmailPanel } from "./EmailPanel";

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

  const userId = await requirePermission(
    CAMPAIGN_PAGE_PERMISSIONS["phase1/selection"],
    { redirectTo: `/campaigns/${campaignId}/dashboard?denied=1` },
  );

  const [
    campaign,
    config,
    activeQuestions,
    applicants,
    emailLogs,
    canSendEmails,
  ] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        phaseOneFinalizedAt: true,
        gdgDayDateTime: true,
        gdgDayLocation: true,
      },
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
        email: true,
        status: true,
        phaseOneScores: { select: { questionId: true } },
        phaseOneResult: {
          select: { weightedTotal: true, rank: true, classification: true },
        },
      },
    }),
    prisma.emailLog.findMany({
      where: { campaignId },
      select: {
        applicantId: true,
        templateKey: true,
        status: true,
        sentAt: true,
        errorMessage: true,
      },
    }),
    hasPermission(userId, PermissionKey.SEND_EMAILS),
  ]);

  // Completeness is recomputed here rather than read from a column so the
  // "still incomplete" line stays honest between recalculations — someone may
  // have scored an applicant since the last ranking pass.
  const activeIds = new Set(activeQuestions.map((q) => q.id));
  const activeQuestionCount = activeQuestions.length;

  const rows: SelectionRow[] = applicants.map((a) => {
    const scored = a.phaseOneScores.filter((s) =>
      activeIds.has(s.questionId),
    ).length;
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

  const finalized = campaign?.phaseOneFinalizedAt != null;

  // Email recipient/sent tallies. Recipients are keyed off the *finalized*
  // status (SHORTLISTED / REJECTED_PHASE1), matching what the batch send will
  // do; "sent" counts distinct applicants already carrying a SENT log for that
  // template, so "pending" is exactly who a normal (non-resend) send would hit.
  const shortlistedIds = applicants
    .filter((a) => a.status === ApplicantStatus.SHORTLISTED)
    .map((a) => a.id);
  const rejectedIds = applicants
    .filter((a) => a.status === ApplicantStatus.REJECTED_PHASE1)
    .map((a) => a.id);

  const sentFor = (templateKey: string) =>
    new Set(
      emailLogs
        .filter((l) => l.templateKey === templateKey && l.status === "SENT")
        .map((l) => l.applicantId),
    );
  const sentAcceptance = sentFor(PHASE1_TEMPLATE.ACCEPTANCE);
  const sentRejection = sentFor(PHASE1_TEMPLATE.REJECTION);

  const acceptance = {
    total: shortlistedIds.length,
    sent: shortlistedIds.filter((id) => sentAcceptance.has(id)).length,
  };
  const rejection = {
    total: rejectedIds.length,
    sent: rejectedIds.filter((id) => sentRejection.has(id)).length,
  };

  const lastSentAt = emailLogs
    .filter((l) => l.status === "SENT")
    .reduce<Date | null>(
      (max, l) => (max === null || l.sentAt > max ? l.sentAt : max),
      null,
    );

  // A FAILED log only counts as "currently failing" if no later SENT row
  // exists for the same applicant+template — a retried-successfully send
  // shouldn't still show as failing.
  const sentKeys = new Set(
    emailLogs
      .filter((l) => l.status === "SENT")
      .map((l) => `${l.applicantId}:${l.templateKey}`),
  );
  const applicantsById = new Map(applicants.map((a) => [a.id, a]));
  const latestFailureByKey = new Map<string, (typeof emailLogs)[number]>();
  for (const l of emailLogs) {
    if (l.status !== "FAILED") continue;
    const key = `${l.applicantId}:${l.templateKey}`;
    if (sentKeys.has(key)) continue;
    const existing = latestFailureByKey.get(key);
    if (!existing || l.sentAt > existing.sentAt) {
      latestFailureByKey.set(key, l);
    }
  }
  const persistedFailures = Array.from(latestFailureByKey.values()).map((l) => {
    const applicant = applicantsById.get(l.applicantId);
    return {
      applicantId: l.applicantId,
      fullName: applicant?.fullName ?? "Unknown applicant",
      email: applicant?.email ?? "",
      templateKey: l.templateKey,
      error: l.errorMessage ?? "Unknown error",
      sentAt: l.sentAt.toISOString(),
    };
  });

  return (
    <div className="space-y-6">
      <SelectionClient
        campaignId={campaignId}
        initialRows={rows}
        targetCount={config?.targetCount ?? null}
        rejectThreshold={config?.rejectThreshold ?? null}
        finalizedAtISO={campaign?.phaseOneFinalizedAt?.toISOString() ?? null}
      />

      {finalized && (
        <div id="phase1-email-panel" className="scroll-mt-6">
          <EmailPanel
            campaignId={campaignId}
            canSendEmails={canSendEmails}
          gdgDayInputValue={
            campaign?.gdgDayDateTime
              ? tunisInputValue(campaign.gdgDayDateTime)
              : null
          }
          gdgDayDisplay={
            campaign?.gdgDayDateTime
              ? formatGdgDayDateTime(campaign.gdgDayDateTime)
              : null
          }
          gdgDayLocation={campaign?.gdgDayLocation ?? null}
            acceptance={acceptance}
            rejection={rejection}
            lastSentAtISO={lastSentAt?.toISOString() ?? null}
            persistedFailures={persistedFailures}
          />
        </div>
      )}
    </div>
  );
}

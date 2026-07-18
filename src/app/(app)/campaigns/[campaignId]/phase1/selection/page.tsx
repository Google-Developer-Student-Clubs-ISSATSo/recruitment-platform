import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";
import { phaseOneCohortWhere } from "@/lib/phase1-ranking";
import { PHASE1_TEMPLATE } from "@/lib/phase1-email-templates";
import { formatGdgDayDateTime } from "@/emails/PhaseOneAcceptanceEmail";
import {
  ApplicantStatus,
  PermissionKey,
  PhaseOneClassification,
} from "@/generated/prisma/enums";
import { SelectionClient, type SelectionRow } from "./SelectionClient";
import { EmailPanel } from "./EmailPanel";

// Render a stored instant as the "YYYY-MM-DDTHH:MM" a datetime-local input wants,
// expressed in Tunis time so the field shows the same wall-clock the TM Lead
// originally typed (see parseTunisLocal in actions.ts for the inverse).
function tunisInputValue(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

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
        />
      )}
    </div>
  );
}

import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";
import { FINAL_TEMPLATE } from "@/lib/final-email-templates";
import { missingLinkLabels } from "@/lib/final-email-links";
import { getCapacityUsage } from "@/lib/committee-capacity-store";
import { readYearOfStudy } from "@/lib/applicant-form-fields";
import { DASHBOARD_STATUSES, type DecisionRow } from "@/lib/final-decision";
import { FinalDecisionClient } from "./FinalDecisionClient";

// The live dashboard driven during the Discord decision meeting.
//
// ENTER_FINAL_DECISION gates loading this page (read access). It replaced
// VIEW_COMMITTEE_DASHBOARD, which is a separate read-only committee view and no
// longer stands in for entering the final-decision screen.
//
// Everything here is read fresh on every render: the applicant pool, and the
// per-committee accepted counts behind the capacity bar. Each decision action
// revalidates this path, so the RSC payload is the single source of truth and
// the bar can never show a count that disagrees with the list under it.
export default async function FinalDecisionPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  await requirePermission(CAMPAIGN_PAGE_PERMISSIONS["final-decision"], {
    redirectTo: `/campaigns/${campaignId}/dashboard?denied=1`,
  });

  const session = await auth();
  const userId = session!.user!.id!;

  const [campaign, applicants, usage] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        finalDecisionCompletedAt: true,
        acceptanceFormLink: true,
        gdgcProgramLink: true,
        gdgcPlatformLink: true,
        discordInviteLink: true,
      },
    }),
    // The open pass (SHORTLISTED / PENDING) plus the already-decided. Decided
    // applicants are loaded so the meeting can re-open one — they're filtered
    // out of the default queue, not out of the page.
    prisma.applicant.findMany({
      where: { campaignId, status: { in: [...DASHBOARD_STATUSES] } },
      select: {
        id: true,
        fullName: true,
        rawFormData: true,
        preferredCommittee: true,
        assignedCommittee: true,
        status: true,
        phaseOneResult: { select: { weightedTotal: true } },
        interviewNote: {
          select: {
            personality: true,
            communication: true,
            motivation: true,
            creativity: true,
            problemSolving: true,
            stressManagement: true,
            teamWork: true,
          },
        },
      },
    }),
    getCapacityUsage(campaignId),
  ]);

  if (!campaign) notFound();

  // Email panel inputs. Only loaded once the meeting is signed off — before
  // that there is nothing to send, and the panel isn't rendered.
  const completed = campaign.finalDecisionCompletedAt !== null;
  const [canSendEmails, alreadySent] = await Promise.all([
    hasPermission(userId, PermissionKey.SEND_EMAILS),
    completed
      ? prisma.emailLog
          .findMany({
            where: {
              campaignId,
              status: "SENT",
              templateKey: {
                in: [FINAL_TEMPLATE.ACCEPTANCE, FINAL_TEMPLATE.REJECTION],
              },
            },
            // Distinct recipients, not raw rows: a resend after a failure would
            // otherwise inflate the "already sent" figure past the pool size.
            distinct: ["applicantId"],
            select: { applicantId: true },
          })
          .then((rows) => rows.length)
      : Promise.resolve(0),
  ]);

  const rows: DecisionRow[] = applicants.map((a) => ({
    id: a.id,
    fullName: a.fullName,
    yearOfStudy: readYearOfStudy(a.rawFormData),
    preferredCommittee: a.preferredCommittee,
    assignedCommittee: a.assignedCommittee,
    status: a.status,
    formScore: a.phaseOneResult?.weightedTotal ?? null,
    // The 7 raw ratings travel to the client, which averages them with the same
    // computeAverage the interview note UI uses. Sending a pre-computed number
    // would fork that definition in two.
    noteScores: a.interviewNote ?? null,
  }));

  return (
    <FinalDecisionClient
      campaignId={campaignId}
      initialRows={rows}
      usage={usage}
      completedAtISO={campaign.finalDecisionCompletedAt?.toISOString() ?? null}
      email={{
        canSend: canSendEmails,
        alreadySent,
        missingLinkLabels: missingLinkLabels({
          acceptanceFormLink: campaign.acceptanceFormLink,
          gdgcProgramLink: campaign.gdgcProgramLink,
          gdgcPlatformLink: campaign.gdgcPlatformLink,
          discordInviteLink: campaign.discordInviteLink,
        }),
      }}
    />
  );
}

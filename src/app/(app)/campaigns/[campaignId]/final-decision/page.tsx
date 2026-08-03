import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { ApplicantStatus, PermissionKey } from "@/generated/prisma/enums";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";
import { FINAL_TEMPLATE } from "@/lib/final-email-templates";
import { missingLinkLabels } from "@/lib/final-email-links";
import { getCapacityUsage } from "@/lib/committee-capacity-store";
import { buildJury } from "@/lib/panel-seat-kind";
import { readYearOfStudy } from "@/lib/applicant-form-fields";
import { DASHBOARD_STATUSES, type DecisionRow } from "@/lib/final-decision";
import { PermissionGate } from "@/components/permission-gate";
import { FinalDecisionClient } from "./FinalDecisionClient";
import { FinalEmailPanel } from "./FinalEmailPanel";

// The live dashboard driven during the Discord decision meeting.
//
// ENTER_FINAL_DECISION is the only key that gates loading this page (read
// access) — plus the TM Lead, who holds it like every other permission. There is
// no read-only committee variant: a Committee Rep without ENTER_FINAL_DECISION
// does not see this page at all.
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
            remarks: true,
            closedAt: true,
            closedBy: { select: { name: true, email: true } },
          },
        },
        interviewPanel: {
          select: {
            seats: {
              select: {
                kind: true,
                claimedBy: { select: { name: true, email: true } },
              },
            },
          },
        },
      },
    }),
    getCapacityUsage(campaignId),
  ]);

  if (!campaign) notFound();

  // Email panel input. Only loaded once the meeting is signed off — before
  // that there is nothing to send, and the panel isn't rendered. Whether the
  // viewer may see the panel at all is <PermissionGate>'s job below, not a
  // value fetched here.
  const completed = campaign.finalDecisionCompletedAt !== null;
  const alreadySent = completed
    ? await prisma.emailLog
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
    : 0;

  const rows: DecisionRow[] = applicants.map((a) => {
    const note = a.interviewNote;
    // Jury in the board's fixed seat order; an unfilled seat's name is null.
    const jury = buildJury(a.interviewPanel?.seats ?? []);
    return {
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
      noteScores: note
        ? {
            personality: note.personality,
            communication: note.communication,
            motivation: note.motivation,
            creativity: note.creativity,
            problemSolving: note.problemSolving,
            stressManagement: note.stressManagement,
            teamWork: note.teamWork,
          }
        : null,
      jury,
      remarks: note?.remarks ?? null,
      noteClosed: note?.closedAt != null,
      closedByName: note?.closedBy?.name ?? note?.closedBy?.email ?? null,
    };
  });

  // Built here rather than inside FinalDecisionClient so <PermissionGate> — a
  // Server Component — can actually gate it. A Server Component can be handed
  // to a Client Component as a prop/children, but never constructed from
  // inside one, so the gate has to live at this level; FinalDecisionClient just
  // renders whatever node it's given, completed campaign or not.
  const emailPanel = completed ? (
    <PermissionGate permission={PermissionKey.SEND_EMAILS}>
      <FinalEmailPanel
        campaignId={campaignId}
        acceptedCount={
          applicants.filter((a) => a.status === ApplicantStatus.ACCEPTED).length
        }
        rejectedCount={
          applicants.filter((a) => a.status === ApplicantStatus.REJECTED_FINAL)
            .length
        }
        alreadySent={alreadySent}
        missingLinkLabels={missingLinkLabels({
          acceptanceFormLink: campaign.acceptanceFormLink,
          gdgcProgramLink: campaign.gdgcProgramLink,
          gdgcPlatformLink: campaign.gdgcPlatformLink,
          discordInviteLink: campaign.discordInviteLink,
        })}
      />
    </PermissionGate>
  ) : null;

  return (
    <FinalDecisionClient
      campaignId={campaignId}
      initialRows={rows}
      usage={usage}
      completedAtISO={campaign.finalDecisionCompletedAt?.toISOString() ?? null}
      emailPanel={emailPanel}
    />
  );
}

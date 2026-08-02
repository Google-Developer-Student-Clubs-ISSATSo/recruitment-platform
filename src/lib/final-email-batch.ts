import { createElement, type ReactElement } from "react";

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { sendTemplatedEmail } from "@/lib/send-email";
import { committeeLabel } from "@/lib/committee";
import { FINAL_SUBJECT, FINAL_TEMPLATE } from "@/lib/final-email-templates";
import {
  missingLinkLabels,
  type FinalEmailLinks,
} from "@/lib/final-email-links";
import { FinalAcceptanceEmail } from "@/emails/FinalAcceptanceEmail";
import { FinalRejectionEmail } from "@/emails/FinalRejectionEmail";
import { ApplicantStatus, Committee } from "@/generated/prisma/enums";

export type SendFailure = { name: string; email: string; error: string };

export type FinalBatchResult =
  | {
      ok: true;
      sent: number;
      failed: number;
      skipped: number;
      failures: SendFailure[];
    }
  | { ok: false; error: string };

type Recipient = {
  id: string;
  fullName: string;
  email: string;
  assignedCommittee: Committee | null;
};

/**
 * Send one templated email per recipient and record an EmailLog row for every
 * attempt — the same shape as the Phase 1 and interview batches.
 *
 * Sequential on purpose: a small batch through a single Gmail SMTP connection
 * is well within limits, and serial sends keep clear of throttling. One failure
 * never aborts the run; every attempt is logged (SENT or FAILED) and a summary
 * comes back.
 */
async function sendEach(
  recipients: Recipient[],
  campaignId: string,
  userId: string,
  templateKey: string,
  subject: string,
  build: (recipient: Recipient) => ReactElement,
): Promise<{ sent: number; failed: number; failures: SendFailure[] }> {
  let sent = 0;
  let failed = 0;
  const failures: SendFailure[] = [];

  for (const applicant of recipients) {
    const result = await sendTemplatedEmail({
      to: applicant.email,
      subject,
      component: build(applicant),
    });

    await prisma.emailLog.create({
      data: {
        applicantId: applicant.id,
        campaignId,
        templateKey,
        status: result.ok ? "SENT" : "FAILED",
        errorMessage: result.ok ? null : result.error,
        sentById: userId,
      },
    });

    if (result.ok) {
      sent++;
    } else {
      failed++;
      failures.push({
        name: applicant.fullName,
        email: applicant.email,
        error: result.error,
      });
    }
  }

  return { sent, failed, failures };
}

/** Everyone already carrying a SENT log for this template in this campaign. */
async function alreadySentIds(
  campaignId: string,
  templateKey: string,
): Promise<Set<string>> {
  const logs = await prisma.emailLog.findMany({
    where: { campaignId, templateKey, status: "SENT" },
    select: { applicantId: true },
  });
  return new Set(logs.map((l) => l.applicantId));
}

/**
 * Send both final-result emails in one pass: acceptances to every ACCEPTED
 * applicant, rejections to every REJECTED_FINAL one. Authorization is the
 * caller's job — this assumes `userId` may already send (see the SEND_EMAILS
 * gate on the action).
 *
 * Refuses outright unless all four campaign links are set. The UI disables the
 * button for the same reason; this is the server-side half, since the action is
 * reachable by POST regardless. An acceptance email with a blank form link
 * would tell people to complete a form that isn't there.
 *
 * Idempotent, reusing Phase 1's rule: anyone with a SENT log for their template
 * in this campaign is skipped, so a re-run only reaches people who haven't
 * successfully received theirs. Dedup keys off SENT specifically rather than the
 * mere presence of a row, so a FAILED attempt is retried instead of stranding
 * the applicant with no result email.
 *
 * An ACCEPTED applicant with no assignedCommittee is skipped rather than mailed
 * a blank committee — Accept always sets one, so this only fires on data that
 * has been edited out-of-band, and silence is better than a broken offer.
 */
export async function runFinalResultsBatch(
  campaignId: string,
  userId: string,
): Promise<FinalBatchResult> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      finalDecisionCompletedAt: true,
      acceptanceFormLink: true,
      gdgcProgramLink: true,
      gdgcPlatformLink: true,
      discordInviteLink: true,
    },
  });
  if (!campaign) return { ok: false, error: "That campaign doesn't exist." };

  if (!campaign.finalDecisionCompletedAt) {
    return {
      ok: false,
      error: "Mark the final decisions complete before sending results.",
    };
  }

  const links: FinalEmailLinks = {
    acceptanceFormLink: campaign.acceptanceFormLink,
    gdgcProgramLink: campaign.gdgcProgramLink,
    gdgcPlatformLink: campaign.gdgcPlatformLink,
    discordInviteLink: campaign.discordInviteLink,
  };
  const missing = missingLinkLabels(links);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Set these links in Configuration first: ${missing.join(", ")}.`,
    };
  }

  const [accepted, rejected] = await Promise.all([
    prisma.applicant.findMany({
      where: { campaignId, status: ApplicantStatus.ACCEPTED },
      select: {
        id: true,
        fullName: true,
        email: true,
        assignedCommittee: true,
      },
    }),
    prisma.applicant.findMany({
      where: { campaignId, status: ApplicantStatus.REJECTED_FINAL },
      select: {
        id: true,
        fullName: true,
        email: true,
        assignedCommittee: true,
      },
    }),
  ]);

  if (accepted.length === 0 && rejected.length === 0) {
    return { ok: false, error: "There are no final decisions to send." };
  }

  const [sentAcceptances, sentRejections] = await Promise.all([
    alreadySentIds(campaignId, FINAL_TEMPLATE.ACCEPTANCE),
    alreadySentIds(campaignId, FINAL_TEMPLATE.REJECTION),
  ]);

  const acceptRecipients = accepted.filter(
    (a) => !sentAcceptances.has(a.id) && a.assignedCommittee !== null,
  );
  const rejectRecipients = rejected.filter((a) => !sentRejections.has(a.id));
  const skipped =
    accepted.length +
    rejected.length -
    acceptRecipients.length -
    rejectRecipients.length;

  if (acceptRecipients.length === 0 && rejectRecipients.length === 0) {
    return { ok: true, sent: 0, failed: 0, skipped, failures: [] };
  }

  const acceptance = await sendEach(
    acceptRecipients,
    campaignId,
    userId,
    FINAL_TEMPLATE.ACCEPTANCE,
    FINAL_SUBJECT.ACCEPTANCE,
    (r) =>
      createElement(FinalAcceptanceEmail, {
        name: r.fullName,
        // Non-null by the filter above; the label is the same wording the
        // applicant picked on the form.
        committee: committeeLabel(r.assignedCommittee!),
        acceptanceFormLink: links.acceptanceFormLink!,
        gdgcProgramLink: links.gdgcProgramLink!,
        gdgcPlatformLink: links.gdgcPlatformLink!,
      }),
  );

  const rejection = await sendEach(
    rejectRecipients,
    campaignId,
    userId,
    FINAL_TEMPLATE.REJECTION,
    FINAL_SUBJECT.REJECTION,
    (r) =>
      createElement(FinalRejectionEmail, {
        name: r.fullName,
        discordInviteLink: links.discordInviteLink!,
      }),
  );

  const sent = acceptance.sent + rejection.sent;
  const failed = acceptance.failed + rejection.failed;
  const failures = [...acceptance.failures, ...rejection.failures];

  await logActivity({
    actorId: userId,
    actionType: "FINAL_EMAILS_SENT",
    targetType: "Campaign",
    targetId: campaignId,
    campaignId,
    details: { sent, failed },
  });

  return { ok: true, sent, failed, skipped, failures };
}

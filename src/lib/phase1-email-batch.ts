import { createElement } from "react";

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { sendTemplatedEmail } from "@/lib/send-email";
import { phaseOneCohortWhere } from "@/lib/phase1-ranking";
import { PHASE1_SUBJECT, PHASE1_TEMPLATE } from "@/lib/phase1-email-templates";
import { PhaseOneAcceptanceEmail } from "@/emails/PhaseOneAcceptanceEmail";
import { PhaseOneRejectionEmail } from "@/emails/PhaseOneRejectionEmail";
import { ApplicantStatus } from "@/generated/prisma/enums";

export type SendFailure = { name: string; email: string; error: string };
export type BatchResult =
  | { ok: true; sent: number; failed: number; skipped: number; failures: SendFailure[] }
  | { ok: false; error: string };

/**
 * Core of the Phase 1 result-email batch, factored out of the server action so
 * it can run either behind the action's SEND_EMAILS gate or from a test harness
 * (a headless context can't mint the auth session the action needs). Authorization
 * is the caller's job — this assumes `userId` is already allowed to send.
 *
 * Acceptance emails go to SHORTLISTED applicants, rejection emails to
 * REJECTED_PHASE1 applicants, but only within the Phase 1 cohort (i.e. carrying
 * a PhaseOneResult) — non-ISSATSO auto-rejects sit at REJECTED_PHASE1 with no
 * result and are never emailed here.
 *
 * Idempotent by default: anyone already carrying a SENT EmailLog row for the
 * relevant template+campaign is skipped, so a re-run only reaches people who
 * haven't successfully received their email. `resend: true` emails everyone
 * again. One failure never aborts the batch — every attempt is logged (SENT or
 * FAILED) and a summary returned.
 */
export async function runPhaseOneEmailBatch(
  campaignId: string,
  userId: string,
  options?: { resend?: boolean },
): Promise<BatchResult> {
  const resend = options?.resend === true;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      phaseOneFinalizedAt: true,
      gdgDayDateTime: true,
      gdgDayLocation: true,
    },
  });
  if (!campaign) return { ok: false, error: "That campaign doesn't exist." };
  if (!campaign.phaseOneFinalizedAt) {
    return { ok: false, error: "Finalize Phase 1 before sending results." };
  }

  const applicants = await prisma.applicant.findMany({
    where: phaseOneCohortWhere(campaignId),
    select: { id: true, fullName: true, email: true, status: true },
  });
  const shortlisted = applicants.filter(
    (a) => a.status === ApplicantStatus.SHORTLISTED,
  );
  const rejected = applicants.filter(
    (a) => a.status === ApplicantStatus.REJECTED_PHASE1,
  );

  if (shortlisted.length === 0 && rejected.length === 0) {
    return { ok: false, error: "There are no shortlisted or rejected applicants to email." };
  }

  const { gdgDayDateTime, gdgDayLocation } = campaign;
  if (shortlisted.length > 0 && (!gdgDayDateTime || !gdgDayLocation)) {
    return {
      ok: false,
      error: "Set the GDG Day date, time and location before sending acceptance emails.",
    };
  }

  // Already-sent applicants (per template) — skipped unless this is a resend.
  const sentLogs = await prisma.emailLog.findMany({
    where: { campaignId, status: "SENT" },
    select: { applicantId: true, templateKey: true },
  });
  const alreadySent = new Set(
    sentLogs.map((l) => `${l.templateKey}:${l.applicantId}`),
  );
  const wasSent = (templateKey: string, applicantId: string) =>
    !resend && alreadySent.has(`${templateKey}:${applicantId}`);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const failures: SendFailure[] = [];

  const logSend = (applicantId: string, templateKey: string, ok: boolean, error?: string) =>
    prisma.emailLog.create({
      data: {
        applicantId,
        campaignId,
        templateKey,
        status: ok ? "SENT" : "FAILED",
        errorMessage: ok ? null : (error ?? "Unknown email error"),
        sentById: userId,
      },
    });

  // Sequential on purpose: a small batch through a single Gmail SMTP connection
  // is well within limits, and serial sends keep us clear of throttling.
  for (const applicant of shortlisted) {
    if (wasSent(PHASE1_TEMPLATE.ACCEPTANCE, applicant.id)) {
      skipped++;
      continue;
    }
    const result = await sendTemplatedEmail({
      to: applicant.email,
      subject: PHASE1_SUBJECT.ACCEPTANCE,
      component: createElement(PhaseOneAcceptanceEmail, {
        name: applicant.fullName,
        gdgDayDateTime: gdgDayDateTime!,
        gdgDayLocation: gdgDayLocation!,
      }),
    });
    await logSend(applicant.id, PHASE1_TEMPLATE.ACCEPTANCE, result.ok, result.ok ? undefined : result.error);
    if (result.ok) {
      sent++;
    } else {
      failed++;
      failures.push({ name: applicant.fullName, email: applicant.email, error: result.error });
    }
  }

  for (const applicant of rejected) {
    if (wasSent(PHASE1_TEMPLATE.REJECTION, applicant.id)) {
      skipped++;
      continue;
    }
    const result = await sendTemplatedEmail({
      to: applicant.email,
      subject: PHASE1_SUBJECT.REJECTION,
      component: createElement(PhaseOneRejectionEmail, {
        name: applicant.fullName,
      }),
    });
    await logSend(applicant.id, PHASE1_TEMPLATE.REJECTION, result.ok, result.ok ? undefined : result.error);
    if (result.ok) {
      sent++;
    } else {
      failed++;
      failures.push({ name: applicant.fullName, email: applicant.email, error: result.error });
    }
  }

  await logActivity({
    actorId: userId,
    actionType: "PHASE1_EMAILS_SENT",
    targetType: "Campaign",
    targetId: campaignId,
    details: { sent, failed },
  });

  return { ok: true, sent, failed, skipped, failures };
}

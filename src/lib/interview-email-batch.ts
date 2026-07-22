import { createElement, type ReactElement } from "react";

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { sendTemplatedEmail } from "@/lib/send-email";
import {
  INTERVIEW_SUBJECT,
  INTERVIEW_TEMPLATE,
} from "@/lib/interview-email-templates";
import { InterviewBookingInviteEmail } from "@/emails/InterviewBookingInviteEmail";
import { InterviewBookingReminderEmail } from "@/emails/InterviewBookingReminderEmail";
import { ApplicantStatus } from "@/generated/prisma/enums";

export type SendFailure = { name: string; email: string; error: string };

/**
 * Both batches refuse to run without a configured booking link — sending either
 * email without one would give applicants no way to actually book. The UI
 * disables the buttons for the same reason; this is the server-side half of
 * that, since the actions are reachable by POST regardless.
 */
export const MISSING_LINK_ERROR =
  "Set the interview calendar link before sending booking emails.";
export type BatchResult =
  | { ok: true; sent: number; failed: number; skipped: number; failures: SendFailure[] }
  | { ok: false; error: string };

type Recipient = { id: string; fullName: string; email: string };

/**
 * Send one templated email per recipient and record an EmailLog row for every
 * attempt. Shared by both interview batches below.
 *
 * Sequential on purpose, matching the Phase 1 batch: a small batch through a
 * single Gmail SMTP connection is well within limits, and serial sends keep us
 * clear of throttling. One failure never aborts the run — every attempt is
 * logged (SENT or FAILED) and a summary is returned.
 */
async function sendEach(
  recipients: Recipient[],
  campaignId: string,
  userId: string,
  templateKey: string,
  subject: string,
  build: (name: string) => ReactElement,
): Promise<{ sent: number; failed: number; failures: SendFailure[] }> {
  let sent = 0;
  let failed = 0;
  const failures: SendFailure[] = [];

  for (const applicant of recipients) {
    const result = await sendTemplatedEmail({
      to: applicant.email,
      subject,
      component: build(applicant.fullName),
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

/**
 * Batch-send the interview booking invitation to every SHORTLISTED applicant in
 * the campaign who hasn't already received it. Authorization is the caller's
 * job — this assumes `userId` is already allowed to send (see the SEND_EMAILS
 * gate on the action).
 *
 * Idempotent: anyone already carrying a SENT log for INTERVIEW_BOOKING_INVITE in
 * this campaign is skipped, so a re-run only reaches people who haven't
 * successfully received it. Dedup keys off SENT specifically (not merely the
 * presence of a row) so a FAILED attempt is retried rather than stranding the
 * applicant with no invite.
 *
 * Every recipient also gets an empty InterviewSlot row (scheduledTime null) —
 * this is what the manual slot-entry table populates, and what makes them count
 * as "not yet booked" for the reminder batch. Slots are created up front, before
 * any send, so a recipient whose email bounces still appears in the table and
 * still gets picked up by the reminder.
 */
export async function runInterviewInviteBatch(
  campaignId: string,
  userId: string,
): Promise<BatchResult> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, interviewCalendarLink: true },
  });
  if (!campaign) return { ok: false, error: "That campaign doesn't exist." };

  const calendarLink = campaign.interviewCalendarLink;
  if (!calendarLink) {
    return { ok: false, error: MISSING_LINK_ERROR };
  }

  const shortlisted = await prisma.applicant.findMany({
    where: { campaignId, status: ApplicantStatus.SHORTLISTED },
    select: { id: true, fullName: true, email: true },
  });
  if (shortlisted.length === 0) {
    return {
      ok: false,
      error: "There are no shortlisted applicants to invite.",
    };
  }

  const sentLogs = await prisma.emailLog.findMany({
    where: {
      campaignId,
      templateKey: INTERVIEW_TEMPLATE.BOOKING_INVITE,
      status: "SENT",
    },
    select: { applicantId: true },
  });
  const alreadySent = new Set(sentLogs.map((l) => l.applicantId));

  const recipients = shortlisted.filter((a) => !alreadySent.has(a.id));
  const skipped = shortlisted.length - recipients.length;

  if (recipients.length === 0) {
    return { ok: true, sent: 0, failed: 0, skipped, failures: [] };
  }

  // skipDuplicates leans on InterviewSlot.applicantId being @unique, so this is
  // safe to re-run and never clobbers a slot someone has already scheduled.
  await prisma.interviewSlot.createMany({
    data: recipients.map((a) => ({ applicantId: a.id })),
    skipDuplicates: true,
  });

  const { sent, failed, failures } = await sendEach(
    recipients,
    campaignId,
    userId,
    INTERVIEW_TEMPLATE.BOOKING_INVITE,
    INTERVIEW_SUBJECT.BOOKING_INVITE,
    (name) => createElement(InterviewBookingInviteEmail, { name, calendarLink }),
  );

  await logActivity({
    actorId: userId,
    actionType: "INTERVIEW_BOOKING_INVITES_SENT",
    targetType: "Campaign",
    targetId: campaignId,
    details: { sent, failed, skipped },
  });

  return { ok: true, sent, failed, skipped, failures };
}

/**
 * Batch-send the booking reminder to SHORTLISTED applicants who were invited but
 * still haven't booked — i.e. they have an InterviewSlot whose scheduledTime is
 * still null. Anyone with a scheduled time is excluded, which is the whole point
 * of the batch.
 *
 * Deliberately NOT deduplicated against EmailLog, unlike the invite and the
 * Phase 1 emails: reminders are expected to go out repeatedly over the booking
 * window, so a second run re-emails everyone still unbooked. Each send is still
 * logged, so the history of who was chased and when stays auditable.
 *
 * Requiring an existing slot row is what keeps this a *reminder*: a shortlisted
 * applicant with no slot was never invited, and needs the invite instead.
 */
export async function runInterviewReminderBatch(
  campaignId: string,
  userId: string,
): Promise<BatchResult> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, interviewCalendarLink: true },
  });
  if (!campaign) return { ok: false, error: "That campaign doesn't exist." };

  const calendarLink = campaign.interviewCalendarLink;
  if (!calendarLink) {
    return { ok: false, error: MISSING_LINK_ERROR };
  }

  const recipients = await prisma.applicant.findMany({
    where: {
      campaignId,
      status: ApplicantStatus.SHORTLISTED,
      interviewSlot: { is: { scheduledTime: null } },
    },
    select: { id: true, fullName: true, email: true },
  });

  if (recipients.length === 0) {
    return {
      ok: false,
      error: "Every invited applicant has already booked a slot.",
    };
  }

  const { sent, failed, failures } = await sendEach(
    recipients,
    campaignId,
    userId,
    INTERVIEW_TEMPLATE.BOOKING_REMINDER,
    INTERVIEW_SUBJECT.BOOKING_REMINDER,
    (name) =>
      createElement(InterviewBookingReminderEmail, { name, calendarLink }),
  );

  await logActivity({
    actorId: userId,
    actionType: "INTERVIEW_BOOKING_REMINDERS_SENT",
    targetType: "Campaign",
    targetId: campaignId,
    details: { sent, failed },
  });

  return { ok: true, sent, failed, skipped: 0, failures };
}

"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { saveInterviewSlot } from "@/lib/interview-slot";
import { parseCalendarLink } from "@/lib/interview-calendar-link";
import {
  claimPanelSeat,
  releasePanelSeat,
  type SeatResult,
} from "@/lib/panel-seat";
import {
  runInterviewInviteBatch,
  runInterviewReminderBatch,
  type SendFailure,
} from "@/lib/interview-email-batch";
import { PermissionKey } from "@/generated/prisma/enums";

// Interview scheduling actions. The page itself opens for CLAIM_PANEL_SEAT, but
// each action re-checks the permission its *own* operation needs — sending is
// SEND_EMAILS, entering a slot is ENTER_INTERVIEW_SLOT. Actions are reachable by
// POST without going through the UI, so the render-time gating on the page is
// never the security boundary.

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };
export type SendSummary = {
  sent: number;
  failed: number;
  skipped: number;
  failures: SendFailure[];
};

/** Checks one permission + that the campaign exists. Returns the actor's id. */
async function authorize(
  campaignId: string,
  permission: PermissionKey,
  denial: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You are signed out." };

  if (!(await hasPermission(userId, permission))) {
    return { ok: false, error: denial };
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!campaign) return { ok: false, error: "That campaign doesn't exist." };

  return { ok: true, userId };
}

/**
 * Set (or replace) the campaign's interview booking calendar link — the URL both
 * booking emails point applicants at. SEND_EMAILS-gated, matching the section it
 * sits in and the GDG Day details form it mirrors.
 *
 * Only http(s) URLs are accepted: the value is rendered as an anchor href in an
 * email, so anything else (a `javascript:` or `data:` URI, or a bare string
 * that isn't a URL at all) is rejected rather than shipped to applicants.
 */
export async function setInterviewCalendarLinkAction(
  campaignId: string,
  link: string,
): Promise<ActionResult<{ link: string }>> {
  const gate = await authorize(
    campaignId,
    PermissionKey.SEND_EMAILS,
    "You don't have permission to configure booking emails.",
  );
  if (!gate.ok) return gate;

  const parsed = parseCalendarLink(link);
  if (!parsed.ok) return parsed;
  const trimmed = parsed.link;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { interviewCalendarLink: trimmed },
  });

  await logActivity({
    actorId: gate.userId,
    actionType: "INTERVIEW_CALENDAR_LINK_SET",
    targetType: "Campaign",
    targetId: campaignId,
    campaignId,
    details: { link: trimmed },
  });

  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return { ok: true, link: trimmed };
}

/**
 * Send the booking invitation to every shortlisted applicant not already
 * invited, creating their empty InterviewSlot rows along the way. See
 * {@link runInterviewInviteBatch} for the recipient and dedup rules.
 */
export async function sendInterviewInvitesAction(
  campaignId: string,
): Promise<ActionResult<SendSummary>> {
  const gate = await authorize(
    campaignId,
    PermissionKey.SEND_EMAILS,
    "You don't have permission to send emails.",
  );
  if (!gate.ok) return gate;

  const result = await runInterviewInviteBatch(campaignId, gate.userId);
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return result;
}

/**
 * Chase everyone who was invited but still hasn't booked. Repeatable by design —
 * see {@link runInterviewReminderBatch}.
 */
export async function sendInterviewRemindersAction(
  campaignId: string,
): Promise<ActionResult<SendSummary>> {
  const gate = await authorize(
    campaignId,
    PermissionKey.SEND_EMAILS,
    "You don't have permission to send emails.",
  );
  if (!gate.ok) return gate;

  const result = await runInterviewReminderBatch(campaignId, gate.userId);
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return result;
}

/**
 * Record the slot an applicant booked on the external calendar. ENTER_INTERVIEW_SLOT-gated
 * here; the write itself — campaign/status checks, time parsing, the upsert and
 * the activity entry — lives in {@link saveInterviewSlot} so it can be exercised
 * outside a request too.
 */
export async function saveInterviewSlotAction(
  campaignId: string,
  applicantId: string,
  scheduledTimeLocal: string,
  room: string,
): Promise<ActionResult<{ scheduledTimeISO: string | null; room: string | null }>> {
  const gate = await authorize(
    campaignId,
    PermissionKey.ENTER_INTERVIEW_SLOT,
    "You don't have permission to enter interview slots.",
  );
  if (!gate.ok) return gate;

  const result = await saveInterviewSlot(
    campaignId,
    applicantId,
    scheduledTimeLocal,
    room,
    gate.userId,
  );
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return result;
}

// ============ PANEL SEAT CLAIMING ============

/**
 * Claim the seat matching the caller's own committee. CLAIM_PANEL_SEAT-gated
 * here; the committee match and the race-safe conditional update live in
 * {@link claimPanelSeat}.
 */
export async function claimPanelSeatAction(
  campaignId: string,
  seatId: string,
): Promise<SeatResult> {
  const gate = await authorize(
    campaignId,
    PermissionKey.CLAIM_PANEL_SEAT,
    "You don't have permission to claim panel seats.",
  );
  if (!gate.ok) return gate;

  const result = await claimPanelSeat(campaignId, seatId, gate.userId);
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return { ok: true };
}

/**
 * Give up a seat — your own, or anyone's if you hold MANAGE_ACCOUNTS. Gated on
 * CLAIM_PANEL_SEAT to reach the board at all; who may release *which* seat is
 * decided in {@link releasePanelSeat}.
 */
export async function releasePanelSeatAction(
  campaignId: string,
  seatId: string,
): Promise<SeatResult> {
  const gate = await authorize(
    campaignId,
    PermissionKey.CLAIM_PANEL_SEAT,
    "You don't have permission to manage panel seats.",
  );
  if (!gate.ok) return gate;

  const result = await releasePanelSeat(campaignId, seatId, gate.userId);
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return { ok: true };
}

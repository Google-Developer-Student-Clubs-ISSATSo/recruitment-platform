"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { saveInterviewSlot, type SaveSlotResult } from "@/lib/interview-slot";
import { parseCalendarLink } from "@/lib/interview-calendar-link";
import {
  assignPanelSeat,
  reassignPanelSeat,
  unassignPanelSeat,
  respondToSeatApproval,
  cancelSeatApproval,
  type SeatResult,
} from "@/lib/panel-seat";
import {
  runInterviewInviteBatch,
  runInterviewReminderBatch,
  type SendFailure,
} from "@/lib/interview-email-batch";
import { PermissionKey } from "@/generated/prisma/enums";

// Interview scheduling actions. The page itself is open to any signed-in member,
// so every action here carries its own check for what its *own* operation needs
// — sending is SEND_EMAILS, entering a slot is ENTER_INTERVIEW_SLOT, and the
// panel actions resolve the acting lead per seat. Actions are reachable by POST
// without going through the UI, so the render-time gating on the page is never
// the security boundary.

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };
export type SendSummary = {
  sent: number;
  failed: number;
  skipped: number;
  failures: SendFailure[];
};

type Gate = { ok: true; userId: string } | { ok: false; error: string };

/**
 * Establishes a signed-in caller and a real campaign, and nothing more.
 *
 * The floor under every action here. On its own it is the whole check only for
 * the panel actions, whose real authorization is per-seat and lives in
 * panel-seat.ts — see the note above that section.
 */
async function authenticate(campaignId: string): Promise<Gate> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You are signed out." };

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!campaign) return { ok: false, error: "That campaign doesn't exist." };

  return { ok: true, userId };
}

/** Checks one permission + that the campaign exists. Returns the actor's id. */
async function authorize(
  campaignId: string,
  permission: PermissionKey,
  denial: string,
): Promise<Gate> {
  const gate = await authenticate(campaignId);
  if (!gate.ok) return gate;

  if (!(await hasPermission(gate.userId, permission))) {
    return { ok: false, error: denial };
  }

  return gate;
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
 *
 * `confirmClear` carries the user's answer to the one question this write asks:
 * clearing a time out from under a staffed panel comes back refused with a
 * `clearImpact` the first time, and goes through when re-sent with this set.
 */
export async function saveInterviewSlotAction(
  campaignId: string,
  applicantId: string,
  scheduledTimeLocal: string,
  room: string,
  confirmClear = false,
): Promise<SaveSlotResult> {
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
    confirmClear,
  );
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return result;
}

// ============ PANEL STAFFING ============
//
// These actions check only that the caller is signed in. That is deliberate and
// is NOT a missing gate: WHO may touch a given seat is resolved inside the
// panel-seat helpers from the live lead holders, and every one of them refuses a
// caller who isn't that seat's current lead, the Administrator, or the Club Lead
// on the request path. That resolution is the authorization, and it is a far
// narrower bar than any permission key could express.
//
// They used to require CLAIM_PANEL_SEAT as a coarse "belongs on this page"
// door. That door is gone with the page-level gate, and the permission would be
// the wrong lock to reuse regardless: CLAIM_PANEL_SEAT now marks who may BE
// SEATED on a panel (it is the pool a lead picks from — see panel-candidates.ts),
// not who may do the seating. Requiring it here would lock a committee lead out
// of staffing their own seat for the unrelated reason that they don't sit on
// panels themselves.

/**
 * Put a member in an empty seat. Only the lead who owns that seat kind (or the
 * Administrator) may do this outright; a Club Lead's attempt on someone else's
 * committee seat turns into an approval request — see {@link assignPanelSeat}.
 */
export async function assignPanelSeatAction(
  campaignId: string,
  seatId: string,
  assigneeId: string,
): Promise<SeatResult> {
  const gate = await authenticate(campaignId);
  if (!gate.ok) return gate;

  const result = await assignPanelSeat(campaignId, seatId, assigneeId, gate.userId);
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return result;
}

/**
 * Swap a seat's occupant for another member, without the seat passing through
 * empty. Same authority as assigning it — see {@link reassignPanelSeat}.
 */
export async function reassignPanelSeatAction(
  campaignId: string,
  seatId: string,
  assigneeId: string,
): Promise<SeatResult> {
  const gate = await authenticate(campaignId);
  if (!gate.ok) return gate;

  const result = await reassignPanelSeat(campaignId, seatId, assigneeId, gate.userId);
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return { ok: true };
}

/** Empty a seat. Same authority as filling it — see {@link unassignPanelSeat}. */
export async function unassignPanelSeatAction(
  campaignId: string,
  seatId: string,
): Promise<SeatResult> {
  const gate = await authenticate(campaignId);
  if (!gate.ok) return gate;

  const result = await unassignPanelSeat(campaignId, seatId, gate.userId);
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return { ok: true };
}

/**
 * Answer a Club Lead's seat request. The approver is re-derived live inside
 * {@link respondToSeatApproval} — the request's stored approverUserId is
 * history, not the permission check.
 */
export async function respondToSeatApprovalAction(
  campaignId: string,
  requestId: string,
  approve: boolean,
): Promise<SeatResult> {
  const gate = await authenticate(campaignId);
  if (!gate.ok) return gate;

  const result = await respondToSeatApproval(
    campaignId,
    requestId,
    approve,
    gate.userId,
  );
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return { ok: true };
}

/** Withdraw your own pending seat request. */
export async function cancelSeatApprovalAction(
  campaignId: string,
  requestId: string,
): Promise<SeatResult> {
  const gate = await authenticate(campaignId);
  if (!gate.ok) return gate;

  const result = await cancelSeatApproval(campaignId, requestId, gate.userId);
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return { ok: true };
}

import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  hasPermission,
  evaluateNoteAccess,
} from "@/lib/permissions";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";
import { INTERVIEW_TEMPLATE } from "@/lib/interview-email-templates";
import { tunisInputValue } from "@/lib/tunis-time";
import { groupScheduledIntoDays, type NoteAccess } from "@/lib/panel-board";
import { PermissionGate } from "@/components/permission-gate";
import { ApplicantStatus, PermissionKey } from "@/generated/prisma/enums";
import { InterviewEmailPanel } from "./InterviewEmailPanel";
import { SlotEntryTable, type SlotRow } from "./SlotEntryTable";
import { PanelBoard } from "./PanelBoard";

// Interviews — booking emails, manual slot entry, and the panel-claiming board.
//
// CLAIM_PANEL_SEAT opens the page (see CAMPAIGN_PAGE_PERMISSIONS["interviews"]),
// but reaching the page grants nothing on its own: each section is wrapped in
// its own <PermissionGate>, so a plain committee rep sees the board and
// literally nothing else — no headings or empty shells for the parts they can't
// use. Every underlying action re-checks its permission independently; these
// gates decide what is *rendered*, never what is *allowed*.
export default async function InterviewsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;

  const userId = await requirePermission(
    CAMPAIGN_PAGE_PERMISSIONS["interviews"],
    { redirectTo: `/campaigns/${campaignId}/dashboard?denied=1` },
  );

  const [
    campaign,
    applicants,
    emailLogs,
    canSendEmails,
    canEnterSlot,
    canOverrideRelease,
    canEditOwnNotes,
    currentUser,
    scheduled,
  ] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { interviewCalendarLink: true },
    }),
    prisma.applicant.findMany({
      where: { campaignId, status: ApplicantStatus.SHORTLISTED },
      select: {
        id: true,
        fullName: true,
        interviewSlot: { select: { scheduledTime: true, room: true } },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.emailLog.findMany({
      where: {
        campaignId,
        templateKey: {
          in: [
            INTERVIEW_TEMPLATE.BOOKING_INVITE,
            INTERVIEW_TEMPLATE.BOOKING_REMINDER,
          ],
        },
        status: "SENT",
      },
      select: { applicantId: true, templateKey: true, sentAt: true },
    }),
    hasPermission(userId, PermissionKey.SEND_EMAILS),
    hasPermission(userId, PermissionKey.ENTER_INTERVIEW_SLOT),
    hasPermission(userId, PermissionKey.MANAGE_ACCOUNTS),
    hasPermission(userId, PermissionKey.EDIT_OWN_INTERVIEW_NOTES),
    prisma.user.findUnique({
      where: { id: userId },
      select: { committee: true },
    }),
    // The board is driven purely by "has a scheduled time" — an applicant with
    // no time yet has nothing to staff, so they're absent rather than shown
    // empty. Status isn't re-filtered here: a slot only ever exists for a
    // shortlisted applicant (saveInterviewSlot enforces that on the way in).
    prisma.applicant.findMany({
      where: {
        campaignId,
        interviewSlot: { is: { scheduledTime: { not: null } } },
      },
      select: {
        id: true,
        fullName: true,
        interviewSlot: { select: { scheduledTime: true, room: true } },
        // Drives the "Completed" badge and the release freeze. Read fresh on
        // every render, so reopening a note restores both immediately.
        interviewNote: { select: { closedAt: true } },
        interviewPanel: {
          select: {
            seats: {
              select: {
                id: true,
                committee: true,
                claimedById: true,
                claimedBy: { select: { name: true, email: true } },
              },
            },
          },
        },
      },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const rows: SlotRow[] = applicants.map((a) => ({
    applicantId: a.id,
    fullName: a.fullName,
    scheduledTimeInput: a.interviewSlot?.scheduledTime
      ? tunisInputValue(a.interviewSlot.scheduledTime)
      : "",
    room: a.interviewSlot?.room ?? "",
    invited: a.interviewSlot != null,
  }));

  // Who a send would actually reach, computed the same way the batches pick
  // recipients so the confirm dialog's numbers match what happens.
  const invitedIds = new Set(
    emailLogs
      .filter((l) => l.templateKey === INTERVIEW_TEMPLATE.BOOKING_INVITE)
      .map((l) => l.applicantId),
  );
  const inviteSent = applicants.filter((a) => invitedIds.has(a.id)).length;

  // Reminders go to applicants who hold a slot row but no time — i.e. they were
  // invited and haven't booked. Someone with no slot row was never invited, and
  // needs the invite rather than a reminder.
  const reminderRecipients = applicants.filter(
    (a) => a.interviewSlot != null && a.interviewSlot.scheduledTime == null,
  ).length;

  // Note access is per applicant: edit rights depend on holding a seat on that
  // specific panel, so it genuinely differs card to card for the same viewer.
  //
  // Computed in memory rather than by asking the permission helpers per row.
  // Those helpers cache on (userId, applicantId), so a distinct applicant per
  // card meant no reuse at all — every card cost its own note lookup and seat
  // lookup, i.e. 2 queries per scheduled applicant. The `scheduled` query above
  // already selects `interviewNote.closedAt` and every seat's `claimedById`, so
  // the same decision falls out of data we have in hand for zero extra queries.
  // The rules themselves stay in evaluateNoteAccess, shared with the
  // single-applicant helpers used by the notes page.
  const accessEntries: [string, NoteAccess][] = scheduled.map((a) => {
    const { canEdit, canView } = evaluateNoteAccess({
      canManageAccounts: canOverrideRelease,
      canEditOwnNotes,
      noteClosed: a.interviewNote?.closedAt != null,
      holdsSeat: (a.interviewPanel?.seats ?? []).some(
        (s) => s.claimedById === userId,
      ),
    });
    return [a.id, canEdit ? "edit" : canView ? "view" : "none"];
  });
  const boardDays = groupScheduledIntoDays(scheduled, new Map(accessEntries));

  // Which sections this user will actually see. Drives only the description
  // wording — the sections gate themselves, and hasPermission is request-cached
  // so these cost no extra queries.
  const seesAdminSections = canSendEmails || canEnterSlot;

  const lastSentFor = (templateKey: string) =>
    emailLogs
      .filter((l) => l.templateKey === templateKey)
      .reduce<Date | null>(
        (max, l) => (max === null || l.sentAt > max ? l.sentAt : max),
        null,
      );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Interviews</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {seesAdminSections
            ? "Invite shortlisted applicants to book an interview, then record the slots they choose."
            : "Claim a seat on interview panels for your committee."}
        </p>
      </div>

      <PermissionGate permission={PermissionKey.SEND_EMAILS}>
        <InterviewEmailPanel
          campaignId={campaignId}
          calendarLink={campaign?.interviewCalendarLink ?? null}
          inviteTotal={applicants.length}
          inviteSent={inviteSent}
          reminderRecipients={reminderRecipients}
          lastInviteSentAtISO={
            lastSentFor(INTERVIEW_TEMPLATE.BOOKING_INVITE)?.toISOString() ?? null
          }
          lastReminderSentAtISO={
            lastSentFor(INTERVIEW_TEMPLATE.BOOKING_REMINDER)?.toISOString() ??
            null
          }
        />
      </PermissionGate>

      <PermissionGate permission={PermissionKey.ENTER_INTERVIEW_SLOT}>
        <SlotEntryTable campaignId={campaignId} rows={rows} />
      </PermissionGate>

      {/* currentUser is only ever null if the account was deleted mid-session. */}
      {currentUser && (
        <PermissionGate permission={PermissionKey.CLAIM_PANEL_SEAT}>
          <PanelBoard
            campaignId={campaignId}
            days={boardDays}
            currentUserId={userId}
            currentUserCommittee={currentUser.committee}
            canOverrideRelease={canOverrideRelease}
          />
        </PermissionGate>
      )}
    </div>
  );
}

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hasPermission, evaluateNoteAccess } from "@/lib/permissions";
import { INTERVIEW_TEMPLATE } from "@/lib/interview-email-templates";
import { tunisInputValue } from "@/lib/tunis-time";
import { groupScheduledIntoDays, type NoteAccess } from "@/lib/panel-board";
import { getSeatPowers } from "@/lib/panel-authority";
import {
  getPanelCandidatesByKind,
  ALL_SEAT_KINDS,
} from "@/lib/panel-candidates";
import { PermissionGate } from "@/components/permission-gate";
import { RefreshButton } from "@/components/refresh-button";
import {
  ApplicantStatus,
  ApprovalStatus,
  PermissionKey,
} from "@/generated/prisma/enums";
import { InterviewEmailPanel } from "./InterviewEmailPanel";
import { SlotEntryTable, type SlotRow } from "./SlotEntryTable";
import { PanelBoard } from "./PanelBoard";
import { MyPanelSummary } from "./MyPanelSummary";

// Interviews — booking emails, manual slot entry, and the panel board.
//
// Open to every authenticated member, with no page-level permission at all —
// hence no entry in CAMPAIGN_PAGE_PERMISSIONS, the same as Statistics. The panel
// board is a roster (who interviews whom, and when), which anyone has reason to
// read; an ordinary member gets it strictly read-only, without a single control.
//
// Reaching the page therefore grants nothing on its own. The two administrative
// sections are each wrapped in their own <PermissionGate>, so a member without
// them sees the board and literally nothing else — no headings or empty shells
// for the parts they can't use. Every underlying action re-checks its own
// permission, and each seat's controls are decided from the live lead holders;
// what is rendered here is never what decides what is allowed.
export default async function InterviewsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;

  // Signed-in is the only bar. Already enforced by the proxy and the (app)
  // layout; re-resolved here as defense in depth, matching Statistics.
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [
    campaign,
    applicants,
    emailLogs,
    canSendEmails,
    canEnterSlot,
    canManageAccounts,
    canEditOwnNotes,
    powers,
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
    // Which seats this viewer owns, resolved live from the current lead
    // holders — never from anything stored on a seat. Reassigning a lead title
    // moves these powers on the very next render.
    getSeatPowers(campaignId, userId),
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
        // The seat for the committee they applied to is the one the Club Lead
        // may never take — the board hides the control rather than offering an
        // action the server would refuse.
        preferredCommittee: true,
        interviewSlot: { select: { scheduledTime: true, room: true } },
        // Drives the "Completed" badge and the panel freeze. Read fresh on
        // every render, so reopening a note restores both immediately.
        interviewNote: { select: { closedAt: true } },
        interviewPanel: {
          select: {
            seats: {
              select: {
                id: true,
                kind: true,
                claimedById: true,
                claimedBy: { select: { name: true, email: true, committee: true } },
                // Only the open request matters to the board; answered ones are
                // history the activity log already carries. At most one can be
                // pending per seat (requestSeatApproval refuses a second).
                approvalRequests: {
                  where: { status: ApprovalStatus.PENDING },
                  select: {
                    id: true,
                    requestedById: true,
                    requestedBy: { select: { name: true, email: true } },
                    assignee: { select: { name: true, email: true } },
                  },
                  orderBy: { createdAt: "asc" },
                },
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
      canManageAccounts,
      canEditOwnNotes,
      noteClosed: a.interviewNote?.closedAt != null,
      holdsSeat: (a.interviewPanel?.seats ?? []).some(
        (s) => s.claimedById === userId,
      ),
    });
    return [a.id, canEdit ? "edit" : canView ? "view" : "none"];
  });
  const boardDays = groupScheduledIntoDays(scheduled, new Map(accessEntries), {
    userId,
    ownedKinds: powers.ownedKinds,
    isClubLead: powers.isClubLead,
    isAdministrator: canManageAccounts,
  });

  // Counted off `scheduled` — the very list the board is built from — rather
  // than queried straight off PanelSeat. Clearing an applicant's slot time
  // keeps their panel and its seats (see interview-slot.ts), so a seat can
  // outlive its place on the board; a direct count would then claim more
  // panels than the viewer can actually see below it. Counting panels, not
  // seats, also matches what the sentence says.
  const myPanelCount = scheduled.filter((a) =>
    (a.interviewPanel?.seats ?? []).some((s) => s.claimedById === userId),
  ).length;

  // Who this viewer may put in each seat kind. The Club Lead still gets a
  // control for every kind — theirs proposes rather than fills on the ones they
  // don't own — so the kinds are loaded the same way.
  //
  // Loaded only for the kinds this viewer can act on, so an ordinary member's
  // render costs nothing extra.
  const staffableKinds =
    canManageAccounts || powers.isClubLead
      ? ALL_SEAT_KINDS
      : powers.ownedKinds;

  const assignableByKind = await getPanelCandidatesByKind(
    campaignId,
    staffableKinds,
  );

  // A Club Lead REQUESTING a seat they don't own may only put themselves
  // forward (see requestSeatApproval) — seating other members is a committee
  // lead's power over their own committee, not something the cross-committee
  // exception carries with it. Narrow the picker so it cannot offer a name the
  // server would refuse.
  //
  // Scoped to exactly that case: `ownedKinds` is left alone, so the Club Lead's
  // own FLOATING seat still lists everyone (the spec has that one ASSIGNED by
  // any of MKT/EER/Club Lead, approval-free), and an Administrator — who fills
  // every seat directly rather than requesting — is excluded from this branch
  // entirely.
  if (powers.isClubLead && !canManageAccounts) {
    for (const kind of ALL_SEAT_KINDS) {
      if (powers.ownedKinds.includes(kind)) continue;
      assignableByKind[kind] = (assignableByKind[kind] ?? []).filter(
        (candidate) => candidate.id === userId,
      );
    }
  }

  // A viewer who can neither staff nor propose sees a plain read-only board —
  // which is most members, by design.
  const isBoardReadOnly = staffableKinds.length === 0;

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Interviews</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {seesAdminSections
              ? "Invite shortlisted applicants to book an interview, then record the slots they choose."
              : isBoardReadOnly
                ? "Who is sitting on each interview panel."
                : "Staff the interview panels you're responsible for."}
          </p>
        </div>
        {/* The board is what this refreshes: <PanelBoard> renders its days
            straight from props (its only state is which day is expanded), so a
            seat another lead just filled or approved shows up on refresh.
            <SlotEntryTable> below does seed its time/room inputs into state —
            deliberately left alone, since re-syncing a field mid-edit would
            discard what someone is typing. */}
        <RefreshButton ariaLabel="Refresh interview panels" />
      </div>

      {/* Ungated like the board itself: this is about the viewer's own seats,
          so it means something to every member regardless of permissions. */}
      <MyPanelSummary count={myPanelCount} />

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

      {/* Ungated, unlike the two sections above: the board is the part of this
          page every member may see. What they can *do* with it is decided seat
          by seat — for most viewers, nothing. */}
      <PanelBoard
        campaignId={campaignId}
        days={boardDays}
        currentUserId={userId}
        assignableByKind={assignableByKind}
        isReadOnly={isBoardReadOnly}
      />
    </div>
  );
}

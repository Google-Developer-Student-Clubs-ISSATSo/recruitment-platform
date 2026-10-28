import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canEditInterviewNote,
  canViewInterviewNote,
  hasPermission,
} from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import { formatTunisDateTime } from "@/lib/tunis-time";
import { buildJury, seatKindLabel } from "@/lib/panel-seat-kind";
import { noteCloseEligibility, type NoteScores } from "@/lib/interview-note";
import {
  readCurrentDiploma,
  readYearOfStudy,
  studyLineOf,
} from "@/lib/applicant-form-fields";
import { Icon, type IconName } from "@/components/app-shell/icon";
import { NoteEditor, type NoteMode } from "./NoteEditor";
import { NoteClosingControls } from "./NoteClosingControls";

/**
 * One shared interview note per applicant, written by whoever is on their panel.
 *
 * Access is decided by canViewInterviewNote / canEditInterviewNote rather than a
 * flat permission: EDIT_OWN_INTERVIEW_NOTES is held by every interviewer, so the
 * seat on *this* applicant's panel is what actually grants access. A closed note
 * is read-only for everyone — even the TM Lead must reopen it to change it —
 * and only the TM Lead can still VIEW it closed. Anyone off the panel is
 * redirected away rather than shown a read-only render.
 */
export default async function InterviewNotesPage({
  params,
}: {
  params: Promise<{ campaignId: string; applicantId: string }>;
}) {
  const { campaignId, applicantId } = await params;

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const deniedTo = `/campaigns/${campaignId}/interviews?denied=1`;

  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: {
      id: true,
      campaignId: true,
      fullName: true,
      rawFormData: true,
      interviewSlot: { select: { scheduledTime: true, room: true } },
      interviewNote: {
        include: { closedBy: { select: { name: true, email: true } } },
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
  });

  // A wrong-campaign applicant is treated as not found rather than reported —
  // the note is not this campaign's to show.
  if (!applicant || applicant.campaignId !== campaignId) redirect(deniedTo);

  const [canView, canEdit, isManage] = await Promise.all([
    canViewInterviewNote(userId, applicantId),
    canEditInterviewNote(userId, applicantId),
    hasPermission(userId, PermissionKey.MANAGE_ACCOUNTS),
  ]);
  if (!canView) redirect(deniedTo);

  const note = applicant.interviewNote;
  const closed = note?.closedAt != null;
  // On an open note, whoever may edit it may also close it (panel member or
  // MANAGE_ACCOUNTS). Reopening is MANAGE_ACCOUNTS-only, and only a closed note
  // shows it — anyone else who can reach this page is looking at an open one.
  // CLOSING SAVES: there is no separate save step, so the editor renders the
  // close strip itself, where the live draft lives.
  const canClose = !closed && canEdit;
  const canReopen = closed && isManage;
  const closedByName =
    note?.closedBy?.name ?? note?.closedBy?.email ?? "Someone";
  // The editor's visual mode. Since a closed note is edit-locked for everyone,
  // `mode` can never be both closed and editable: an account manager looking at
  // a closed note is in "locked" — which is now read-only like "readonly", but a
  // distinctly LOUDER read-only, since a closed note is the exceptional state.
  const mode: NoteMode = closed ? "locked" : canEdit ? "edit" : "readonly";
  const initialScores: NoteScores = {
    personality: note?.personality ?? null,
    communication: note?.communication ?? null,
    motivation: note?.motivation ?? null,
    creativity: note?.creativity ?? null,
    problemSolving: note?.problemSolving ?? null,
    stressManagement: note?.stressManagement ?? null,
    teamWork: note?.teamWork ?? null,
  };

  // Jury, in the board's fixed seat order. An unfilled seat reads "Open" so the
  // panel's gaps are visible here too, not just on the board.
  const jury = buildJury(applicant.interviewPanel?.seats ?? []);

  const yearOfStudy = readYearOfStudy(applicant.rawFormData);
  const currentDiploma = readCurrentDiploma(applicant.rawFormData);
  // Same "Year X · Diploma" line Phase 2 and Final Decision show under a name;
  // null when the form has neither, in which case the Meta reads "Not set".
  const studyLine = studyLineOf({ yearOfStudy, currentDiploma });
  const scheduled = applicant.interviewSlot?.scheduledTime ?? null;

  // Whether closing is available yet. Evaluated on the server so the control
  // renders in the right state on first paint; the action re-evaluates it
  // against a fresh read, which is where the rule is actually enforced.
  const closeEligibility = noteCloseEligibility({
    scheduledTime: scheduled,
    now: new Date(),
  });
  const closeTooEarly = closeEligibility.state === "too_early";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/campaigns/${campaignId}/interviews`}
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-foreground dark:text-neutral-400"
        >
          <Icon name="arrow_back" className="text-[16px]" />
          Back to interviews
        </Link>
      </div>

      {/* Header: who they are, and who's interviewing them.
          Below md the two blocks stack in reading order — name, then the
          jury — rather than trying to hold a two-up row at a width where
          the jury names would truncate to initials. */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:flex-wrap md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
              {applicant.fullName}
            </h1>
            <div className="mt-2 flex flex-col gap-1 text-sm text-neutral-500 dark:text-neutral-400 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
              <Meta icon="school" label="Studies" value={studyLine} />
              <Meta
                icon="schedule"
                label="Interview"
                value={scheduled ? formatTunisDateTime(scheduled) : null}
              />
              {applicant.interviewSlot?.room && (
                <Meta
                  icon="meeting_room"
                  label="Room"
                  value={applicant.interviewSlot.room}
                />
              )}
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
              Jury
            </p>
            <ul className="mt-1 space-y-0.5">
              {jury.map((j) => (
                <li key={j.kind} className="flex items-center gap-2 text-sm">
                  <span className="inline-flex min-w-10 shrink-0 justify-center rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                    {seatKindLabel(j.kind)}
                  </span>
                  {j.name ? (
                    <span className="truncate text-foreground">{j.name}</span>
                  ) : (
                    <span className="italic text-neutral-400">Open</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Closing status. A closed note only ever renders here for a
            MANAGE_ACCOUNTS holder (everyone else was redirected away), so the
            reopen button and closed banner are safe to show unconditionally
            when `closed` is true. The close ACTION itself lives at the BOTTOM
            of the page, next to the note it closes. */}
        {closed && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <p className="flex items-center gap-1.5 rounded-lg bg-status-rejected/10 px-3 py-2 text-xs font-medium text-status-rejected">
              <Icon name="lock" className="text-[14px]" />
              Closed by {closedByName}
              {note?.closedAt ? ` on ${formatTunisDateTime(note.closedAt)}` : ""}.
              It&apos;s locked for everyone — reopen it to view or change it.
            </p>
            {canReopen && (
              <NoteClosingControls
                campaignId={campaignId}
                applicantId={applicantId}
              />
            )}
          </div>
        )}

        {!canEdit && !closed && (
          <p className="mt-4 flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            <Icon name="lock" className="text-[14px]" />
            Read-only — you&apos;re not on this applicant&apos;s panel.
          </p>
        )}
      </div>

      <NoteEditor
        campaignId={campaignId}
        applicantId={applicantId}
        editable={canEdit}
        mode={mode}
        viewerId={userId}
        noteUpdatedAt={note?.updatedAt ?? null}
        initialScores={initialScores}
        initialRemarks={note?.remarks ?? ""}
        canClose={canClose}
        tooEarly={closeTooEarly}
        canForceClose={isManage}
        scheduledLabel={scheduled ? formatTunisDateTime(scheduled) : null}
        allowedAtLabel={
          closeEligibility.state === "too_early"
            ? formatTunisDateTime(closeEligibility.allowedAt)
            : null
        }
      />
    </div>
  );
}

function Meta({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string | null;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon name={icon} className="text-[16px]" />
      <span className="sr-only">{label}: </span>
      {value ?? <span className="italic text-neutral-400">Not set</span>}
    </span>
  );
}

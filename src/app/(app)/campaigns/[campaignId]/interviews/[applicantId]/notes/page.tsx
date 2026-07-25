import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  canEditInterviewNote,
  canViewInterviewNote,
  hasPermission,
} from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import { formatTunisDateTime } from "@/lib/tunis-time";
import { PANEL_COMMITTEES } from "@/lib/interview-slot";
import type { NoteScores } from "@/lib/interview-note";
import { readYearOfStudy } from "@/lib/applicant-form-fields";
import { Icon, type IconName } from "@/components/app-shell/icon";
import { NoteEditor, type NoteMode } from "./NoteEditor";
import { NoteClosingControls } from "./NoteClosingControls";

/**
 * One shared interview note per applicant, written by whoever is on their panel.
 *
 * Access is decided by canViewInterviewNote / canEditInterviewNote rather than a
 * flat permission: EDIT_OWN_INTERVIEW_NOTES is held by every interviewer, so the
 * seat on *this* applicant's panel is what actually grants write access. A
 * Committee Rep with VIEW_COMMITTEE_DASHBOARD gets a read-only render — no
 * inputs at all, not merely disabled ones — and the save actions refuse them
 * independently.
 */
export default async function InterviewNotesPage({
  params,
}: {
  params: Promise<{ campaignId: string; applicantId: string }>;
}) {
  const { campaignId, applicantId } = await params;

  const session = await auth();
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
      phaseOneResult: { select: { weightedTotal: true } },
      interviewSlot: { select: { scheduledTime: true, room: true } },
      interviewNote: {
        include: { closedBy: { select: { name: true, email: true } } },
      },
      interviewPanel: {
        select: {
          seats: {
            select: {
              committee: true,
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
  const canClose = !closed && canEdit;
  const canReopen = closed && isManage;
  const closedByName =
    note?.closedBy?.name ?? note?.closedBy?.email ?? "Someone";
  // The editor's visual mode. `closed` wins over `canEdit` on purpose: a closed
  // note is still writable by MANAGE_ACCOUNTS, and that is exactly the case the
  // loud surface exists to flag.
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

  // Jury, in the board's fixed MKT → TM → EER order. An unclaimed seat reads
  // "Open" so the panel's gaps are visible here too, not just on the board.
  const seatByCommittee = new Map(
    (applicant.interviewPanel?.seats ?? []).map((s) => [s.committee, s]),
  );
  const jury = PANEL_COMMITTEES.map((committee) => {
    const seat = seatByCommittee.get(committee);
    const holder = seat?.claimedBy;
    return {
      committee,
      name: holder ? (holder.name ?? holder.email) : null,
    };
  });

  const formScore = applicant.phaseOneResult?.weightedTotal ?? null;
  const yearOfStudy = readYearOfStudy(applicant.rawFormData);
  const scheduled = applicant.interviewSlot?.scheduledTime ?? null;

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
          Below md the three blocks stack in reading order — name, then the
          score, then the jury — rather than trying to hold a two-up row at a
          width where the jury names would truncate to initials. */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:flex-wrap md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
              {applicant.fullName}
            </h1>
            <div className="mt-2 flex flex-col gap-1 text-sm text-neutral-500 dark:text-neutral-400 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
              <Meta icon="school" label="Year of study" value={yearOfStudy} />
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

          <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
                Form Score
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
                {formScore === null ? "—" : formScore.toFixed(2)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
                Jury
              </p>
              <ul className="mt-1 space-y-0.5">
                {jury.map((j) => (
                  <li
                    key={j.committee}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="inline-flex min-w-10 shrink-0 justify-center rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                      {j.committee}
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
        </div>

        {/* Closing controls + status. A closed note only ever renders here for a
            MANAGE_ACCOUNTS holder (everyone else was redirected away), so the
            reopen button and closed banner are safe to show unconditionally when
            `closed` is true. */}
        {(closed || canClose) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            {closed ? (
              <p className="flex items-center gap-1.5 rounded-lg bg-status-rejected/10 px-3 py-2 text-xs font-medium text-status-rejected">
                <Icon name="lock" className="text-[14px]" />
                Closed by {closedByName}
                {note?.closedAt ? ` on ${formatTunisDateTime(note.closedAt)}` : ""}.
                Only account managers can view or edit it now.
              </p>
            ) : (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Closing the note locks it — you&apos;ll lose access to it
                afterwards.
              </p>
            )}
            {canClose && (
              <NoteClosingControls
                campaignId={campaignId}
                applicantId={applicantId}
                mode="close"
              />
            )}
            {canReopen && (
              <NoteClosingControls
                campaignId={campaignId}
                applicantId={applicantId}
                mode="reopen"
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
        initialScores={initialScores}
        initialRemarks={note?.remarks ?? ""}
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

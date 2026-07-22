import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditInterviewNote, canViewInterviewNote } from "@/lib/permissions";
import { formatTunisDateTime } from "@/lib/tunis-time";
import { PANEL_COMMITTEES } from "@/lib/interview-slot";
import type { NoteScores } from "@/lib/interview-note";
import { readYearOfStudy } from "@/lib/applicant-form-fields";
import { Icon } from "@/components/app-shell/icon";
import { NoteEditor } from "./NoteEditor";

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
      interviewNote: true,
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

  const [canView, canEdit] = await Promise.all([
    canViewInterviewNote(userId, applicantId),
    canEditInterviewNote(userId, applicantId),
  ]);
  if (!canView) redirect(deniedTo);

  const note = applicant.interviewNote;
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

      {/* Header: who they are, and who's interviewing them */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {applicant.fullName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400">
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

          <div className="flex flex-wrap items-start gap-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
                Form Score
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
                {formScore === null ? "—" : formScore.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
                Jury
              </p>
              <ul className="mt-1 space-y-0.5">
                {jury.map((j) => (
                  <li key={j.committee} className="flex items-center gap-2 text-sm">
                    <span className="inline-flex min-w-10 justify-center rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                      {j.committee}
                    </span>
                    {j.name ? (
                      <span className="text-foreground">{j.name}</span>
                    ) : (
                      <span className="italic text-neutral-400">Open</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {!canEdit && (
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
  icon: string;
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

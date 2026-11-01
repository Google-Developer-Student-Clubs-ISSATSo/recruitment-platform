import { prisma } from "@/lib/prisma";
import { buildJury } from "@/lib/panel-seat-kind";
import { readCurrentDiploma, readYearOfStudy } from "@/lib/applicant-form-fields";
import { DASHBOARD_STATUSES, type DecisionRow } from "@/lib/final-decision";

// Database access for the Final Decision dashboard's applicant rows. The pure
// row type and helpers live in final-decision.ts (client-safe); this module is
// server-only, the same split phase2.ts / phase2-store.ts uses. Both the page
// and the interview-reviews PDF read through here, so the two can never disagree
// about who is in the pool or what their note says.

/**
 * Every applicant the dashboard loads — the open pass (SHORTLISTED / PENDING)
 * plus the already-decided, so the meeting can re-open one — as DecisionRows.
 *
 * Campaign-scoped in the `where`, never implied. No Phase 1 form score is
 * selected: the meeting decides on the interview, and a form figure on screen
 * (or in a printed packet) would anchor that judgment.
 *
 * Phase 2 entries are NOT filtered by the notes/flags visibility switches:
 * everyone who may reach the dashboard reads the full paper trail the decision
 * rests on. The switches govern the Phase 2 page only.
 */
export async function getDecisionRows(
  campaignId: string,
): Promise<DecisionRow[]> {
  const applicants = await prisma.applicant.findMany({
    where: { campaignId, status: { in: [...DASHBOARD_STATUSES] } },
    select: {
      id: true,
      fullName: true,
      rawFormData: true,
      preferredCommittee: true,
      assignedCommittee: true,
      status: true,
      interviewSlot: { select: { scheduledTime: true, room: true } },
      interviewNote: {
        select: {
          personality: true,
          communication: true,
          motivation: true,
          creativity: true,
          problemSolving: true,
          stressManagement: true,
          teamWork: true,
          remarks: true,
          closedAt: true,
          closedBy: { select: { name: true, email: true } },
        },
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
      // Oldest first, as on the Phase 2 page: a correcting entry has to read
      // after the one it corrects.
      phase2Entries: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          text: true,
          createdAt: true,
          author: { select: { name: true, email: true } },
        },
      },
    },
  });

  return applicants.map((a) => {
    const note = a.interviewNote;
    // Jury in the board's fixed seat order; an unfilled seat's name is null.
    const jury = buildJury(a.interviewPanel?.seats ?? []);
    return {
      id: a.id,
      fullName: a.fullName,
      yearOfStudy: readYearOfStudy(a.rawFormData),
      currentDiploma: readCurrentDiploma(a.rawFormData),
      preferredCommittee: a.preferredCommittee,
      assignedCommittee: a.assignedCommittee,
      status: a.status,
      // The 7 raw ratings travel to the client, which averages them with the same
      // computeAverage the interview note UI uses. Sending a pre-computed number
      // would fork that definition in two.
      noteScores: note
        ? {
            personality: note.personality,
            communication: note.communication,
            motivation: note.motivation,
            creativity: note.creativity,
            problemSolving: note.problemSolving,
            stressManagement: note.stressManagement,
            teamWork: note.teamWork,
          }
        : null,
      jury,
      remarks: note?.remarks ?? null,
      noteClosed: note?.closedAt != null,
      closedByName: note?.closedBy?.name ?? note?.closedBy?.email ?? null,
      closedAtISO: note?.closedAt?.toISOString() ?? null,
      interviewAtISO: a.interviewSlot?.scheduledTime?.toISOString() ?? null,
      interviewRoom: a.interviewSlot?.room ?? null,
      phase2Entries: a.phase2Entries.map((e) => ({
        id: e.id,
        type: e.type,
        authorName: e.author.name ?? e.author.email,
        createdAtISO: e.createdAt.toISOString(),
        text: e.text,
      })),
    };
  });
}

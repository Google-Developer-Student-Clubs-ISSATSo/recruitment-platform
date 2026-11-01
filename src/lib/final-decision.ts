import { ApplicantStatus, Committee } from "@/generated/prisma/enums";
import { computeAverage, type NoteScores } from "@/lib/interview-note";
import type { JurySeat } from "@/lib/panel-seat-kind";
import type { Phase2Entry } from "@/lib/phase2-store";

// Pure final-decision helpers. Imports NOTHING from the database layer — the
// dashboard client component pulls this in, and importing prisma here would
// drag the pg stack into the browser bundle (see committee-capacity.ts for the
// same split). Persistence lives in the route's actions.ts.

/**
 * What the decision buttons mean. UNDECIDE is the undo behind "Remove accepted",
 * "Unreject" and "Remove from shortlisted": it sends the applicant back to the
 * open pass.
 */
export type FinalDecision = "ACCEPT" | "REJECT" | "SHORTLIST" | "UNDECIDE";

/**
 * The status each decision writes. Everything but Accept also clears
 * assignedCommittee — only an accepted applicant belongs to a committee, and a
 * waitlisted one is undetermined until they're resolved off the pool.
 */
export const DECISION_STATUS: Record<FinalDecision, ApplicantStatus> = {
  ACCEPT: ApplicantStatus.ACCEPTED,
  REJECT: ApplicantStatus.REJECTED_FINAL,
  SHORTLIST: ApplicantStatus.PENDING,
  UNDECIDE: ApplicantStatus.SHORTLISTED,
};

/** How a decision reads in a sentence, e.g. "changes Sara to <rejected>". */
export const DECISION_PHRASE: Record<FinalDecision, string> = {
  ACCEPT: "accepted",
  REJECT: "rejected",
  SHORTLIST: "shortlisted",
  UNDECIDE: "undecided",
};

/**
 * Statuses that still need a decision — the main pass. SHORTLISTED means
 * "passed Phase 1, not yet decided"; PENDING means "waitlisted, being
 * reconsidered". Both are open questions at the meeting.
 */
export const UNDECIDED_STATUSES: readonly ApplicantStatus[] = [
  ApplicantStatus.SHORTLISTED,
  ApplicantStatus.PENDING,
];

/** Every status the dashboard loads: the open pass plus the already-decided. */
export const DASHBOARD_STATUSES: readonly ApplicantStatus[] = [
  ...UNDECIDED_STATUSES,
  ApplicantStatus.ACCEPTED,
  ApplicantStatus.REJECTED_FINAL,
];

/** How one applicant currently stands, for the list indicator. */
export type DecisionState = "UNDECIDED" | "ACCEPTED" | "REJECTED" | "SHORTLISTED";

export function decisionStateOf(status: ApplicantStatus): DecisionState {
  switch (status) {
    case ApplicantStatus.ACCEPTED:
      return "ACCEPTED";
    case ApplicantStatus.REJECTED_FINAL:
      return "REJECTED";
    case ApplicantStatus.PENDING:
      return "SHORTLISTED";
    default:
      return "UNDECIDED";
  }
}

/**
 * Where a committee sits against its target. "at" and "over" both warn; they're
 * kept apart because the meeting treats "full" and "overbooked" differently —
 * one is a stop sign, the other is a mistake already made.
 */
export type CapacityLevel = "under" | "at" | "over";

export function capacityLevel(accepted: number, target: number): CapacityLevel {
  if (accepted > target) return "over";
  if (accepted >= target) return "at";
  return "under";
}

/** Live seat usage for one committee. Counts are always computed, never stored. */
export type CommitteeUsage = {
  committee: Committee;
  accepted: number;
  target: number;
};

/**
 * One panel seat as the Final Decision drill-in shows it. Re-exported from the
 * seat-kind vocabulary rather than redefined, so this page and the interview
 * pages describe a jury the same way.
 */
export type { JurySeat };

/**
 * The dashboard's per-applicant row. Interview scores arrive as the raw 7
 * fields rather than a pre-computed average so the client can reuse
 * computeAverage — the single definition of that mean, shared with the
 * interview note UI.
 *
 * The jury / remarks / closed fields feed the collapsible "View Full Interview
 * Notes" section. This page is MANAGE_ACCOUNTS/ENTER_FINAL_DECISION-gated, so it
 * always carries the full note regardless of the note's open/closed state.
 */
export type DecisionRow = {
  id: string;
  fullName: string;
  yearOfStudy: string | null;
  /** Current diploma as entered on the form — the field they study. */
  currentDiploma: string | null;
  preferredCommittee: Committee;
  assignedCommittee: Committee | null;
  status: ApplicantStatus;
  /** Null when the applicant has no InterviewNote row at all. */
  noteScores: NoteScores | null;
  /** This panel's seats in fixed kind order; name null = seat unfilled. */
  jury: JurySeat[];
  /** Free-text panel remarks, or null. */
  remarks: string | null;
  /** Whether the interview note has been closed. */
  noteClosed: boolean;
  /** Who closed it, if closed. */
  closedByName: string | null;
  /** When it was closed, as an ISO instant — null while open. */
  closedAtISO: string | null;
  /** Booked interview time (an ISO instant) and room, or null when not booked. */
  interviewAtISO: string | null;
  interviewRoom: string | null;
  /**
   * Every Phase 2 note and flag for this applicant, oldest first. Unfiltered by
   * the Phase 2 visibility switches — this page is already permission-gated.
   */
  phase2Entries: Phase2Entry[];
};

/**
 * Interview average for a row, or null for "not yet interviewed" — which covers
 * both no note row and a note row whose 7 fields are all still empty. Those two
 * are indistinguishable to the meeting, so they read the same in the UI.
 */
export function interviewAverage(row: DecisionRow): number | null {
  return row.noteScores === null ? null : computeAverage(row.noteScores);
}

/** One decimal, matching the interview note readout. */
export function formatScore(value: number | null, digits = 1): string {
  return value === null ? "—" : value.toFixed(digits);
}

/** Which way the interview ranking runs: best first, or least first. */
export type SortDirection = "desc" | "asc";

/**
 * Order by interview average in `direction`, name breaking ties. An
 * un-interviewed applicant sorts below everyone with a score in BOTH
 * directions — a missing average is neither a good one nor a bad one.
 */
export function compareByInterview(
  direction: SortDirection = "desc",
): (a: DecisionRow, b: DecisionRow) => number {
  return (a, b) => {
    const avgA = interviewAverage(a);
    const avgB = interviewAverage(b);
    if (avgA !== null && avgB !== null && avgA !== avgB) {
      return direction === "desc" ? avgB - avgA : avgA - avgB;
    }
    if (avgA !== null && avgB === null) return -1;
    if (avgA === null && avgB !== null) return 1;
    return a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id);
  };
}

import { ApplicantStatus, Committee } from "@/generated/prisma/enums";
import { computeAverage, type NoteScores } from "@/lib/interview-note";
import type { JurySeat } from "@/lib/panel-seat-kind";

// Pure final-decision helpers. Imports NOTHING from the database layer — the
// dashboard client component pulls this in, and importing prisma here would
// drag the pg stack into the browser bundle (see committee-capacity.ts for the
// same split). Persistence lives in the route's actions.ts.

/** What the three decision buttons mean. */
export type FinalDecision = "ACCEPT" | "REJECT" | "SHORTLIST";

/**
 * The status each decision writes. Reject and Shortlist also clear
 * assignedCommittee — only an accepted applicant belongs to a committee, and a
 * waitlisted one is undetermined until they're resolved off the pool.
 */
export const DECISION_STATUS: Record<FinalDecision, ApplicantStatus> = {
  ACCEPT: ApplicantStatus.ACCEPTED,
  REJECT: ApplicantStatus.REJECTED_FINAL,
  SHORTLIST: ApplicantStatus.PENDING,
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
  preferredCommittee: Committee;
  assignedCommittee: Committee | null;
  status: ApplicantStatus;
  formScore: number | null;
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

/**
 * Shortlist Pool order: best interview first, form score breaking ties. An
 * un-interviewed applicant sorts below everyone with a score rather than at the
 * top — a missing average is not a good one.
 */
export function compareForPool(a: DecisionRow, b: DecisionRow): number {
  const avgA = interviewAverage(a);
  const avgB = interviewAverage(b);
  if (avgA !== null && avgB !== null && avgA !== avgB) return avgB - avgA;
  if (avgA !== null && avgB === null) return -1;
  if (avgA === null && avgB !== null) return 1;
  return (b.formScore ?? -1) - (a.formScore ?? -1);
}

/** Main-pass order: highest Phase 1 weighted total first. */
export function compareByFormScore(a: DecisionRow, b: DecisionRow): number {
  return (b.formScore ?? -1) - (a.formScore ?? -1);
}

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { ApplicantStatus } from "@/generated/prisma/enums";
import { NOTE_FIELDS } from "@/lib/interview-note";
import { PANEL_COMMITTEES } from "@/lib/interview-slot";
import { tunisDateKey } from "@/lib/tunis-time";

// Everything the campaign dashboard counts. Every figure here is COUNTED on
// read from the applicant / interview rows themselves — nothing is stored and
// re-read, for the same reason CommitteeCapacity keeps no accepted counter and
// InterviewNote keeps no average: a stored figure drifts the moment a status
// changes by a path that forgot to update it, and a live count cannot.
//
// Each loader is wrapped in React's `cache`, so a page that renders the stat
// cards *and* the funnel from the same numbers pays for one query, not two —
// and the two can never disagree within a render.

/**
 * Every status that means "passed Phase 1". Deliberately spelled out rather
 * than "not SUBMITTED and not REJECTED_PHASE1" as a *set*, because the counts
 * below derive the shortlisted figure by subtraction — see
 * {@link getCampaignCounts} — so a status added to the enum later lands in the
 * passed bucket automatically instead of silently vanishing from the totals.
 */
export const PHASE_ONE_PASSED_STATUSES: readonly ApplicantStatus[] = [
  ApplicantStatus.SHORTLISTED,
  ApplicantStatus.INVITED_GDG_DAY,
  ApplicantStatus.INTERVIEW_SCHEDULED,
  ApplicantStatus.ACCEPTED,
  ApplicantStatus.PENDING,
  ApplicantStatus.REJECTED_FINAL,
];

export type CampaignCounts = {
  /** Every applicant in the campaign. */
  total: number;
  /** Still awaiting a Phase 1 verdict. */
  submitted: number;
  /**
   * Passed Phase 1 — cumulative, so an applicant who has since been
   * interviewed, accepted or rejected at the final stage still counts here.
   * `submitted + shortlisted + rejectedPhaseOne === total`, always.
   */
  shortlisted: number;
  /** Rejected at Phase 1. */
  rejectedPhaseOne: number;
  /** Accepted into a committee. */
  accepted: number;
};

/** Per-status applicant counts for one campaign, in a single grouped query. */
export const getCampaignCounts = cache(async function getCampaignCounts(
  campaignId: string,
): Promise<CampaignCounts> {
  const grouped = await prisma.applicant.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });

  const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
  const count = (status: ApplicantStatus) => byStatus.get(status) ?? 0;

  const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
  const submitted = count(ApplicantStatus.SUBMITTED);
  const rejectedPhaseOne = count(ApplicantStatus.REJECTED_PHASE1);

  return {
    total,
    submitted,
    // By subtraction, so the three buckets always add up to the pool size even
    // if a new downstream status appears in the enum.
    shortlisted: total - submitted - rejectedPhaseOne,
    rejectedPhaseOne,
    accepted: count(ApplicantStatus.ACCEPTED),
  };
});

/**
 * How many applicants have actually been interviewed.
 *
 * "Interviewed" means an InterviewNote carrying at least one of the seven
 * ratings — the same test {@link interviewAverage} uses to decide whether an
 * applicant has an interview score at all. A note row created but never filled
 * in is not an interview, and neither definition should be able to drift from
 * the other, so both read off NOTE_FIELDS.
 */
export const countInterviewed = cache(async function countInterviewed(
  campaignId: string,
): Promise<number> {
  return prisma.interviewNote.count({
    where: {
      applicant: { campaignId },
      OR: NOTE_FIELDS.map((f) => ({ [f.key]: { not: null } })),
    },
  });
});

/** One bar of the pipeline funnel. */
export type FunnelStage = {
  key: string;
  label: string;
  count: number;
  /** What the stage means, shown under the bar. */
  hint: string;
};

/**
 * The pipeline as four cumulative stages: everyone who *reached* each one,
 * rather than everyone sitting at it right now. Cumulative is what makes the
 * gap between two bars mean attrition — with "currently at" counts, an
 * applicant moving forward would look like one lost from the earlier stage.
 *
 * The stages are not strict supersets of each other, though: Interviewed is
 * evidence-based (a filled-in note) while Accepted is a status, so a decision
 * taken without the note ever being written shows up in the later stage and
 * not the earlier one. The widget names that gap rather than hiding it.
 */
export const getPipelineFunnel = cache(async function getPipelineFunnel(
  campaignId: string,
): Promise<FunnelStage[]> {
  const [counts, interviewed] = await Promise.all([
    getCampaignCounts(campaignId),
    countInterviewed(campaignId),
  ]);

  return [
    {
      key: "submitted",
      label: "Submitted",
      count: counts.total,
      hint: "Applications received",
    },
    {
      key: "shortlisted",
      label: "Shortlisted",
      count: counts.shortlisted,
      hint: "Passed Phase 1 screening",
    },
    {
      key: "interviewed",
      label: "Interviewed",
      count: interviewed,
      hint: "Interview note has at least one rating",
    },
    {
      key: "accepted",
      label: "Accepted",
      count: counts.accepted,
      hint: "Joined a committee",
    },
  ];
});

export type InterviewSnapshot = {
  /** Interviews whose scheduled time falls on today's Tunis calendar date. */
  today: number;
  /** Scheduled interviews with fewer than one claimed seat per committee. */
  needingPanel: number;
  /** Every interview with a time on the calendar. */
  scheduled: number;
};

/**
 * Today's interview load and how much of it is still unstaffed.
 *
 * "Today" is the Tunis calendar date, not the server's: an interview at 00:30
 * Tunis is still today locally but belongs to the previous UTC day, and would
 * otherwise be counted against the wrong date. Same reasoning as the panel
 * board's day grouping, and the same helper.
 *
 * A panel is full when every committee holds a seat, so the threshold is
 * PANEL_COMMITTEES.length rather than a hardcoded 3 — one definition of how
 * wide a panel is, shared with the code that creates the seats.
 */
export const getInterviewSnapshot = cache(async function getInterviewSnapshot(
  campaignId: string,
): Promise<InterviewSnapshot> {
  const scheduled = await prisma.applicant.findMany({
    where: {
      campaignId,
      interviewSlot: { is: { scheduledTime: { not: null } } },
    },
    select: {
      interviewSlot: { select: { scheduledTime: true } },
      interviewPanel: { select: { seats: { select: { claimedById: true } } } },
    },
  });

  const todayKey = tunisDateKey(new Date());
  let today = 0;
  let needingPanel = 0;

  for (const applicant of scheduled) {
    const at = applicant.interviewSlot?.scheduledTime;
    if (!at) continue;

    if (tunisDateKey(at) === todayKey) today += 1;

    const claimed = (applicant.interviewPanel?.seats ?? []).filter(
      (seat) => seat.claimedById !== null,
    ).length;
    // An applicant scheduled before panels existed has no panel at all, which
    // reads as zero claimed seats — understaffed, which is exactly right.
    if (claimed < PANEL_COMMITTEES.length) needingPanel += 1;
  }

  return { today, needingPanel, scheduled: scheduled.length };
});

/**
 * Whole days from `now` to `target`, both taken as Tunis calendar dates.
 * Positive is future, 0 is today, negative is past. Compared as dates rather
 * than instants so "GDG Day is today" stays true all day, instead of flipping
 * to "1 day ago" the moment the event's start time passes.
 */
export function tunisDayDelta(target: Date, now: Date = new Date()): number {
  const day = (d: Date) => Date.parse(`${tunisDateKey(d)}T00:00:00Z`);
  return Math.round((day(target) - day(now)) / 86_400_000);
}

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { PANEL_COMMITTEES } from "@/lib/interview-slot";
import {
  countInterviewed,
  getCampaignCounts,
} from "@/lib/campaign-statistics";
import { tunisDateKey } from "@/lib/tunis-time";

// The dashboard's view-model layer: the shapes its widgets render.
//
// The applicant counts themselves are NOT defined here — they live in
// campaign-statistics.ts, which the Statistics page reads from too. This module
// only arranges them into funnel stages, so the funnel and the Statistics page
// can never quote different totals for the same campaign.
//
// The interview snapshot below is dashboard-only and stays here.

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

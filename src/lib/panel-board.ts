import {
  tunisDateKey,
  formatTunisDayLabel,
  formatTunisTimeOfDay,
} from "@/lib/tunis-time";
import { PANEL_COMMITTEES } from "@/lib/interview-slot";
import type { Committee } from "@/generated/prisma/enums";

export type BoardSeat = {
  seatId: string;
  committee: Committee;
  claimedById: string | null;
  claimedByName: string | null;
};

export type BoardCard = {
  applicantId: string;
  fullName: string;
  /** Just the time ("2:30 PM") — the day is already in the group header. */
  scheduledTimeLabel: string;
  room: string | null;
  seats: BoardSeat[];
  /**
   * This viewer's access to this applicant's interview note. Resolved per card
   * on the server, because edit access depends on holding a seat on *this*
   * panel — it varies card by card for the same user. "none" hides the link.
   */
  noteAccess: "edit" | "view" | "none";
};

/**
 * One interview day. Everything date-shaped is pre-computed on the server in
 * Tunis time — including `isToday` — so the client renders plain strings and
 * can't disagree about the date in another timezone.
 */
export type BoardDay = {
  /** "YYYY-MM-DD" in Tunis. Stable React key and the chronological sort key. */
  dateKey: string;
  /** e.g. "Tuesday, July 21". */
  dateLabel: string;
  isToday: boolean;
  isPast: boolean;
  cards: BoardCard[];
};

/** The shape the interviews page selects; declared structurally so the grouping
 * can be exercised without a database. */
export type ScheduledApplicant = {
  id: string;
  fullName: string;
  interviewSlot: { scheduledTime: Date | null; room: string | null } | null;
  interviewPanel: {
    seats: {
      id: string;
      committee: Committee;
      claimedById: string | null;
      claimedBy: { name: string | null; email: string } | null;
    }[];
  } | null;
};

export type NoteAccess = "edit" | "view" | "none";

/**
 * Turn the scheduled-applicant rows into the board's day groups.
 *
 * Days come back earliest-first and each day's cards ascend by time, so the
 * board always reads chronologically regardless of the order rows arrived in.
 * Grouping is by *Tunis* calendar date rather than the server's zone: an
 * interview at 00:30 Tunis is still that local day but a previous UTC one, and
 * would otherwise be filed under the wrong header.
 *
 * `noteAccess` is resolved by the caller (the checks are async and per
 * applicant) and looked up here; an applicant missing from the map gets "none",
 * so a card can only ever show a notes link the caller explicitly allowed.
 *
 * `now` is injected rather than read from the clock so "today" is testable.
 */
export function groupScheduledIntoDays(
  scheduled: ScheduledApplicant[],
  noteAccess: Map<string, NoteAccess> = new Map(),
  now: Date = new Date(),
): BoardDay[] {
  // Seats are ordered here, not in the query: the board must always read
  // MKT → TM → EER regardless of the order rows happen to come back in.
  const seatOrder = new Map(PANEL_COMMITTEES.map((c, i) => [c, i]));
  const todayKey = tunisDateKey(now);
  const byDay = new Map<string, { at: Date; card: BoardCard }[]>();

  for (const a of scheduled) {
    const at = a.interviewSlot?.scheduledTime;
    // Callers filter to scheduled applicants; this also narrows the type.
    if (!at) continue;

    const card: BoardCard = {
      applicantId: a.id,
      fullName: a.fullName,
      scheduledTimeLabel: formatTunisTimeOfDay(at),
      room: a.interviewSlot?.room ?? null,
      noteAccess: noteAccess.get(a.id) ?? "none",
      seats: [...(a.interviewPanel?.seats ?? [])]
        .sort(
          (x, y) =>
            (seatOrder.get(x.committee) ?? 0) - (seatOrder.get(y.committee) ?? 0),
        )
        .map((s) => ({
          seatId: s.id,
          committee: s.committee,
          claimedById: s.claimedById,
          // Seed users may have no display name; fall back to the email so a
          // claimed seat never renders as blank.
          claimedByName: s.claimedById
            ? (s.claimedBy?.name ?? s.claimedBy?.email ?? "Unknown")
            : null,
        })),
    };

    const key = tunisDateKey(at);
    const bucket = byDay.get(key);
    if (bucket) bucket.push({ at, card });
    else byDay.set(key, [{ at, card }]);
  }

  return [...byDay.entries()]
    // "YYYY-MM-DD" sorts chronologically as a plain string, earliest first.
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, entries]) => ({
      dateKey,
      dateLabel: formatTunisDayLabel(entries[0].at),
      isToday: dateKey === todayKey,
      isPast: dateKey < todayKey,
      cards: entries
        .sort((x, y) => x.at.getTime() - y.at.getTime())
        .map((e) => e.card),
    }));
}

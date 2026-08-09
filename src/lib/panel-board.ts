import {
  tunisDateKey,
  formatTunisDayLabel,
  formatTunisTimeOfDay,
} from "@/lib/tunis-time";
import { SEAT_KIND_COMMITTEE, SEAT_KIND_ORDER } from "@/lib/panel-seat-kind";
import { isInterviewDone } from "@/lib/interview-note";
import { resolveIdentityColor, type IdentityColor } from "@/lib/identity-color";
import type { Committee, PanelSeatKind } from "@/generated/prisma/enums";

/** A Club Lead's still-open request for a seat, as the board renders it. */
export type BoardSeatRequest = {
  requestId: string;
  requestedById: string;
  requestedByName: string;
  /** Who would take the seat. Their own name when they asked for themselves. */
  assigneeName: string;
};

export type BoardSeat = {
  seatId: string;
  kind: PanelSeatKind;
  claimedById: string | null;
  claimedByName: string | null;
  /**
   * Colour for the holder's initials chip. Null on an empty seat. Resolved
   * from their committee alone: a seat holder's lead titles aren't loaded
   * here, and the two roles that would override a committee colour
   * (Club/Technical Lead) say nothing about which seat they're sitting in.
   */
  claimedByColor: IdentityColor | null;
  /**
   * The pending request for this seat, if one is open. Only ever populated for
   * a viewer allowed to see it (the requester or the seat's current lead) —
   * resolved by the caller, since it depends on live lead resolution.
   */
  pendingRequest: BoardSeatRequest | null;
  /**
   * A request is open on this seat, so it is spoken for but not filled. Shown
   * to EVERY viewer — an empty-looking seat that another lead is already
   * waiting on would otherwise invite a second, conflicting assignment. Who
   * asked and for whom stays in `pendingRequest`, which is need-to-know.
   */
  awaitingApproval: boolean;
  /** This viewer may fill/empty this seat outright (they are its lead). */
  canAssign: boolean;
  /**
   * This viewer may propose someone for this seat, subject to its lead's
   * approval (they are the Club Lead). Same control as `canAssign` in the UI —
   * the difference is only what the server does with it.
   */
  canRequest: boolean;
  /** This viewer may answer the pending request above. */
  canRespond: boolean;
};

export type BoardCard = {
  applicantId: string;
  fullName: string;
  /** Just the time ("2:30 PM") — the day is already in the group header. */
  scheduledTimeLabel: string;
  room: string | null;
  /**
   * The committee this applicant applied to, shown on every card for every
   * viewer. It is the context that makes the panel legible: it says which of
   * the seats below is the applicant's own committee judging them and which are
   * the cross-committee check, and it is the seat the Club Lead may never take.
   */
  preferredCommittee: Committee;
  seats: BoardSeat[];
  /**
   * This viewer's access to this applicant's interview note. Resolved per card
   * on the server, because edit access depends on holding a seat on *this*
   * panel — it varies card by card for the same user. "none" hides the link.
   */
  noteAccess: "edit" | "view" | "none";
  /**
   * The interview happened and its note was closed — see {@link isInterviewDone}.
   * Freezes the panel: seats can no longer be changed, because they are the
   * record of who actually conducted the interview. Recomputed from the note's
   * current `closedAt` on every render, so a reopen unfreezes it.
   */
  interviewDone: boolean;
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
  /** The seat for this committee is off-limits to the Club Lead entirely. */
  preferredCommittee: Committee;
  interviewSlot: { scheduledTime: Date | null; room: string | null } | null;
  /** Null when no note row exists yet — which counts as not-done. */
  interviewNote: { closedAt: Date | null } | null;
  interviewPanel: {
    seats: {
      id: string;
      kind: PanelSeatKind;
      claimedById: string | null;
      claimedBy: { name: string | null; email: string; committee: Committee } | null;
      approvalRequests: {
        id: string;
        requestedById: string;
        requestedBy: { name: string | null; email: string };
        assignee: { name: string | null; email: string } | null;
      }[];
    }[];
  } | null;
};

export type NoteAccess = "edit" | "view" | "none";

/**
 * What the viewer may do, resolved live from the current lead holders before
 * this is called. Passed in rather than derived here so this module stays pure
 * and the (async, database-backed) authority resolution happens once per page
 * rather than once per seat.
 */
export type ViewerPowers = {
  userId: string;
  /** Seat kinds this viewer owns as their lead — they may fill/empty these. */
  ownedKinds: readonly PanelSeatKind[];
  isClubLead: boolean;
  /** MANAGE_ACCOUNTS: may fill/empty any seat and answer any request. */
  isAdministrator: boolean;
};

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
  powers: ViewerPowers | null = null,
  now: Date = new Date(),
): BoardDay[] {
  // Seats are ordered here, not in the query: the board must always read
  // MKT → TM → EER → Floating regardless of the order rows come back in.
  const seatOrder = new Map(SEAT_KIND_ORDER.map((k, i) => [k, i]));
  const todayKey = tunisDateKey(now);
  const byDay = new Map<string, { at: Date; card: BoardCard }[]>();

  const owns = (kind: PanelSeatKind) =>
    powers !== null &&
    (powers.isAdministrator || powers.ownedKinds.includes(kind));

  for (const a of scheduled) {
    const at = a.interviewSlot?.scheduledTime;
    // Callers filter to scheduled applicants; this also narrows the type.
    if (!at) continue;

    const frozen = isInterviewDone(a.interviewNote);

    const card: BoardCard = {
      applicantId: a.id,
      fullName: a.fullName,
      scheduledTimeLabel: formatTunisTimeOfDay(at),
      room: a.interviewSlot?.room ?? null,
      preferredCommittee: a.preferredCommittee,
      noteAccess: noteAccess.get(a.id) ?? "none",
      interviewDone: frozen,
      seats: [...(a.interviewPanel?.seats ?? [])]
        .sort(
          (x, y) => (seatOrder.get(x.kind) ?? 0) - (seatOrder.get(y.kind) ?? 0),
        )
        .map((s) => {
          const open = s.approvalRequests[0] ?? null;
          const canAssign = !frozen && owns(s.kind) && open === null;
          // The Club Lead may propose someone for a committee seat they don't
          // own — but never for the floating seat, which is already theirs to
          // fill, and never for the seat of the committee this applicant
          // actually applied to, which no approval can unlock.
          const canRequest =
            !frozen &&
            powers !== null &&
            powers.isClubLead &&
            !owns(s.kind) &&
            s.kind !== "FLOATING" &&
            SEAT_KIND_COMMITTEE[s.kind] !== a.preferredCommittee &&
            s.claimedById === null &&
            open === null;
          const canRespond = !frozen && open !== null && owns(s.kind);
          const maySeeRequest =
            open !== null &&
            powers !== null &&
            (owns(s.kind) || open.requestedById === powers.userId);

          return {
            seatId: s.id,
            kind: s.kind,
            claimedById: s.claimedById,
            // Seed users may have no display name; fall back to the email so a
            // filled seat never renders as blank.
            claimedByName: s.claimedById
              ? (s.claimedBy?.name ?? s.claimedBy?.email ?? "Unknown")
              : null,
            claimedByColor: s.claimedBy
              ? resolveIdentityColor({ committee: s.claimedBy.committee })
              : null,
            pendingRequest:
              maySeeRequest && open
                ? {
                    requestId: open.id,
                    requestedById: open.requestedById,
                    requestedByName:
                      open.requestedBy.name ?? open.requestedBy.email,
                    // No assignee row means a request from before seats could
                    // be asked for on someone else's behalf — those were always
                    // the requester asking for themselves.
                    assigneeName:
                      open.assignee?.name ??
                      open.assignee?.email ??
                      open.requestedBy.name ??
                      open.requestedBy.email,
                  }
                : null,
            awaitingApproval: open !== null,
            canAssign,
            canRequest,
            canRespond,
          };
        }),
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

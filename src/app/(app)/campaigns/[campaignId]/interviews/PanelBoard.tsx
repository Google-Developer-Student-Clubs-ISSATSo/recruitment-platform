"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app-shell/icon";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";
import type { Committee } from "@/generated/prisma/enums";
import type { BoardDay, BoardCard, BoardSeat } from "@/lib/panel-board";

export type { BoardDay, BoardCard, BoardSeat };
import { claimPanelSeatAction, releasePanelSeatAction } from "./actions";


/** "Amine Hammami" → "AH". Falls back to one letter for single-word names. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The interviewer panel-claiming board — a card per scheduled applicant, each
 * holding one seat per committee.
 *
 * Layout follows the Stitch "Interviewer Panel Board" screen (header strip with
 * initials tile + time, three seat rows, a completion footer), but every colour
 * comes from our own tokens rather than Stitch's raw hex.
 *
 * One deliberate departure from the mock: Stitch tints each committee chip a
 * different hue (green/blue/red). Our palette has no committee colours — the
 * only semantic colours we own are status-accepted / status-rejected /
 * status-pending — so borrowing them here would paint the EER chip in the exact
 * red that means "rejected" everywhere else in the app. Committee chips are
 * therefore neutral, and colour is reserved strictly for seat *state*: green for
 * claimed and for a complete panel, amber for a panel still short of
 * interviewers. Seats always render in the fixed MKT → TM → EER order, so
 * position rather than hue is what makes a card scannable.
 */
export function PanelBoard({
  campaignId,
  days,
  currentUserId,
  currentUserCommittee,
  canOverrideRelease,
}: {
  campaignId: string;
  days: BoardDay[];
  currentUserId: string;
  currentUserCommittee: Committee;
  canOverrideRelease: boolean;
}) {
  const allCards = days.flatMap((d) => d.cards);
  const totalSeats = allCards.reduce((n, c) => n + c.seats.length, 0);
  const filledSeats = allCards.reduce(
    (n, c) => n + c.seats.filter((s) => s.claimedById !== null).length,
    0,
  );

  return (
    <div className="space-y-5 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon name="groups" className="text-[20px]" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Interviewer Panel Board
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Claim open interview seats. You can only take your own
              committee&apos;s seat ({currentUserCommittee}).
            </p>
          </div>
        </div>

        {totalSeats > 0 && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              filledSeats === totalSeats
                ? "bg-status-accepted/10 text-status-accepted"
                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            <Icon name="event_seat" className="text-[16px]" />
            {filledSeats}/{totalSeats} seats filled
          </span>
        )}
      </div>

      {allCards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No interviews scheduled yet. Once a slot time is entered, that
          applicant&apos;s panel opens for claiming here.
        </p>
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <DaySection
              key={day.dateKey}
              campaignId={campaignId}
              day={day}
              currentUserId={currentUserId}
              currentUserCommittee={currentUserCommittee}
              canOverrideRelease={canOverrideRelease}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One collapsible day of interviews.
 *
 * Past days start collapsed and today/future start open: over a real multi-week
 * season the board accumulates days that are done and never need looking at
 * again, and collapsing them keeps the day you actually care about reachable
 * without scrolling past history. With only a handful of days it costs nothing —
 * everything upcoming is open already.
 */
function DaySection({
  campaignId,
  day,
  currentUserId,
  currentUserCommittee,
  canOverrideRelease,
}: {
  campaignId: string;
  day: BoardDay;
  currentUserId: string;
  currentUserCommittee: Committee;
  canOverrideRelease: boolean;
}) {
  const [open, setOpen] = useState(!day.isPast);
  const reduced = useReducedMotion();

  const dayFilled = day.cards.reduce(
    (n, c) => n + c.seats.filter((s) => s.claimedById !== null).length,
    0,
  );
  const daySeats = day.cards.reduce((n, c) => n + c.seats.length, 0);

  return (
    <section
      className={`overflow-hidden rounded-xl border ${
        day.isToday
          ? "border-primary/40 bg-primary/[0.03]"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-left transition-colors duration-150 ease-out hover:bg-neutral-50 motion-reduce:transition-none dark:hover:bg-neutral-800/40"
      >
        {/* One chevron that rotates, rather than swapping between two glyphs —
            the rotation is the affordance, and a swap can't be animated. */}
        <Icon
          name="chevron_right"
          className={`text-[18px] text-neutral-400 transition-transform duration-200 ease-out motion-reduce:transition-none ${
            open ? "rotate-90" : ""
          }`}
        />
        <h3
          className={`text-sm font-semibold ${
            day.isToday ? "text-primary" : "text-foreground"
          }`}
        >
          {day.dateLabel}
        </h3>
        {day.isToday && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
            Today
          </span>
        )}
        {day.isPast && (
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
            Past
          </span>
        )}
        {/* Basis-full below sm so the seat tally drops to its own line instead of
            squeezing the date label at 375px. */}
        <span className="basis-full text-xs text-neutral-500 sm:ml-auto sm:basis-auto dark:text-neutral-400">
          <strong>{day.cards.length}</strong> interview
          {day.cards.length === 1 ? "" : "s"} ·{" "}
          {dayFilled}/{daySeats} seats
        </span>
      </button>

      {/* Height-animated collapse. Past days start closed, so on a board with a
          few weeks of history this is the control someone actually uses; snapping
          open makes it unclear whether the content appeared or the page jumped. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="day-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: DURATION.slow, ease: EASE.inOut }
            }
            className="overflow-hidden"
          >
            {/* Three-up only from 2xl. At 1280 (xl) a card is a third of the
                content column, which is ~300px once the sidebar and padding are
                taken out — narrow enough that interviewer names truncate to
                "Med …". Two-up holds until 1536, where thirds are wide enough to
                show a full name. */}
            <div className="grid gap-4 px-4 pb-4 md:grid-cols-2 2xl:grid-cols-3">
              {day.cards.map((card) => (
                <PanelCard
                  key={card.applicantId}
                  campaignId={campaignId}
                  card={card}
                  currentUserId={currentUserId}
                  currentUserCommittee={currentUserCommittee}
                  canOverrideRelease={canOverrideRelease}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function PanelCard({
  campaignId,
  card,
  currentUserId,
  currentUserCommittee,
  canOverrideRelease,
}: {
  campaignId: string;
  card: BoardCard;
  currentUserId: string;
  currentUserCommittee: Committee;
  canOverrideRelease: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filled = card.seats.filter((s) => s.claimedById !== null).length;
  const complete = filled === card.seats.length && card.seats.length > 0;
  // Note the two distinct meanings of "complete" on this card: `complete` is
  // seat staffing (all three claimed), `card.interviewDone` is the interview
  // itself having happened and been written up. They move independently.
  const done = card.interviewDone;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
    });
  }

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-[border-color,box-shadow] duration-200 ease-out hover:shadow-md motion-reduce:transition-none dark:bg-neutral-900 ${
        complete
          ? "border-status-accepted/40"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      {/* Header: who and when */}
      <div className="flex items-start justify-between gap-3 border-b border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-neutral-200 text-sm font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
            {initialsOf(card.fullName)}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-foreground">
              {card.fullName}
            </h3>
            {/* The interview happened and its note was closed. Same pill shape,
                size and status-accepted tokens as <BookingStatusBadge> and the
                Phase 1 classification badges, rather than a new visual idiom.
                Sits directly under the name so the state reads as belonging to
                this applicant, not to the seats below. */}
            {done && (
              <span className="mt-1 inline-flex items-center rounded-full bg-status-accepted/10 px-2.5 py-0.5 text-[11px] font-semibold text-status-accepted">
                Completed
              </span>
            )}
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              <Icon name="schedule" className="text-[14px]" />
              {card.scheduledTimeLabel}
            </p>
            {card.room && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                <Icon name="meeting_room" className="text-[14px]" />
                Room {card.room}
              </p>
            )}
          </div>
        </div>

        {/* One pip per seat, filled in the same MKT → TM → EER order as the rows
            below. The footer already states the count in words; this is for
            scanning a grid of cards for the half-empty one without reading any of
            them, which is the whole reason this section is a board. */}
        <span
          className="flex shrink-0 items-center gap-1"
          aria-label={`${filled} of ${card.seats.length} seats filled`}
        >
          {card.seats.map((s) => (
            <span
              key={s.seatId}
              aria-hidden
              className={`size-1.5 rounded-full transition-colors duration-200 ease-out motion-reduce:transition-none ${
                s.claimedById !== null
                  ? "bg-status-accepted"
                  : "bg-neutral-300 dark:bg-neutral-600"
              }`}
            />
          ))}
        </span>
      </div>

      {/* Seats, always MKT → TM → EER */}
      <div className="flex-1 space-y-2 p-4">
        {card.seats.map((seat) => (
          <SeatRow
            key={seat.seatId}
            seat={seat}
            pending={pending}
            isMine={seat.claimedById === currentUserId}
            isMyCommittee={seat.committee === currentUserCommittee}
            canOverrideRelease={canOverrideRelease}
            interviewDone={done}
            onClaim={() =>
              run(() => claimPanelSeatAction(campaignId, seat.seatId))
            }
            onRelease={() =>
              run(() => releasePanelSeatAction(campaignId, seat.seatId))
            }
          />
        ))}
        {error && (
          <p className="rounded-lg bg-status-rejected/10 px-3 py-2 text-xs text-status-rejected">
            {error}
          </p>
        )}
      </div>

      {/* Notes link — omitted entirely when this viewer has no access to the
          note, so the card never advertises a page they'd be redirected out of. */}
      {card.noteAccess !== "none" && (
        <div className="px-4 pb-3">
          <Link
            href={`/campaigns/${campaignId}/interviews/${card.applicantId}/notes`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Icon
              name={card.noteAccess === "edit" ? "edit_note" : "visibility"}
              className="text-[16px]"
            />
            {card.noteAccess === "edit" ? "Enter Notes" : "View Notes"}
          </Link>
        </div>
      )}

      {/* Completion strip */}
      <div
        className={`border-t px-4 py-2 text-center text-[10px] font-bold uppercase tracking-widest ${
          complete
            ? "border-status-accepted/20 bg-status-accepted/10 text-status-accepted"
            : "border-neutral-200 bg-status-pending/10 text-[color:var(--status-pending)] dark:border-neutral-800"
        }`}
      >
        {complete
          ? "Panel Complete"
          : `Needs Interviewers — ${filled}/${card.seats.length} filled`}
      </div>
    </div>
  );
}

function SeatRow({
  seat,
  pending,
  isMine,
  isMyCommittee,
  canOverrideRelease,
  interviewDone,
  onClaim,
  onRelease,
}: {
  seat: BoardSeat;
  pending: boolean;
  isMine: boolean;
  isMyCommittee: boolean;
  canOverrideRelease: boolean;
  /** This applicant's interview is done — the panel is frozen. */
  interviewDone: boolean;
  onClaim: () => void;
  onRelease: () => void;
}) {
  const reduced = useReducedMotion();
  const claimed = seat.claimedById !== null;
  // Whoever holds it may hand it back; MANAGE_ACCOUNTS may free anyone's seat.
  // Once the interview is done, neither can: the seats have stopped being a
  // staffing plan and become the record of who conducted it. That applies to
  // the override too — `releasePanelSeat` refuses both cases server-side, and a
  // button that only ever returned an error would be worse than no button.
  const canRelease = claimed && !interviewDone && (isMine || canOverrideRelease);

  /**
   * A one-shot wash of colour over the seat after you act on it.
   *
   * Claiming a seat is a server round-trip that changes one row inside a grid of
   * cards, and the resulting difference — a name where "Awaiting interviewer"
   * used to be — is easy to miss when you are looking at the button you just
   * pressed. The flash draws the eye to the row that changed.
   *
   * Driven by the CLICK rather than by watching `seat.claimedById`, deliberately:
   * a prop-watching flash would also fire for every already-claimed seat on first
   * paint, lighting up the whole board on page load. `nonce` lets a repeated
   * claim/release re-trigger it. Green for claiming, amber for releasing — the
   * same tokens those two states mean everywhere else in the app.
   */
  const [flash, setFlash] = useState<{
    kind: "claim" | "release";
    nonce: number;
  } | null>(null);

  const trigger = (kind: "claim" | "release") => {
    if (reduced) return;
    setFlash((f) => ({ kind, nonce: (f?.nonce ?? 0) + 1 }));
  };

  return (
    <div
      className={`relative isolate flex items-center justify-between gap-2 overflow-hidden rounded-lg px-3 py-2 transition-colors duration-200 ease-out motion-reduce:transition-none ${
        claimed
          ? "bg-status-accepted/5"
          : "border border-dashed border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/40"
      }`}
    >
      <AnimatePresence>
        {flash && (
          <motion.span
            aria-hidden
            key={flash.nonce}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.slow, ease: EASE.out }}
            onAnimationComplete={() => setFlash(null)}
            className={`pointer-events-none absolute inset-0 -z-10 ${
              flash.kind === "claim"
                ? "bg-status-accepted"
                : "bg-status-pending"
            }`}
          />
        )}
      </AnimatePresence>

      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
          {seat.committee}
        </span>
        {claimed ? (
          <span className="flex min-w-0 items-center gap-2">
            {/* An initials chip for the holder, so a filled seat reads as "a
                person is in it" at a glance — the board equivalent of an
                assignee avatar. Tinted with primary rather than the seat's
                status green, so it identifies rather than restating "claimed". */}
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
              {initialsOf(seat.claimedByName ?? "?")}
            </span>
            <span className="truncate text-sm font-medium text-foreground">
              {seat.claimedByName}
              {isMine && (
                <span className="ml-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400">
                  (you)
                </span>
              )}
            </span>
          </span>
        ) : (
          <span className="truncate text-sm italic text-neutral-500 dark:text-neutral-400">
            Awaiting interviewer
          </span>
        )}
      </div>

      {claimed ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {/* The padlock only earns its space when there is no Release button:
              with one present, the button already says the seat is taken, and the
              row is tight enough at two-up that ~22px of redundant chrome is what
              pushes the interviewer's name into an ellipsis. */}
          {!canRelease && (
            <Icon name="lock" className="text-[16px] text-status-accepted" />
          )}
          {canRelease && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              title={isMine ? "Release your seat" : "Release this seat (override)"}
              onClick={() => {
                trigger("release");
                onRelease();
              }}
            >
              Release
            </Button>
          )}
        </div>
      ) : isMyCommittee ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            trigger("claim");
            onClaim();
          }}
        >
          Claim
        </Button>
      ) : (
        // Another committee's seat: shown as open so the card reads honestly,
        // but with no affordance — this user can never claim it.
        <span className="shrink-0 text-xs font-medium text-neutral-400">
          Open
        </span>
      )}
    </div>
  );
}

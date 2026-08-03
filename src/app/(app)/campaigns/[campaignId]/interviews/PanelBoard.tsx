"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app-shell/icon";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";
import { committeeLabel } from "@/lib/committee";
import { seatKindLabel } from "@/lib/panel-seat-kind";
import type { PanelCandidate } from "@/lib/panel-candidates";
import type { BoardDay, BoardCard, BoardSeat } from "@/lib/panel-board";

export type { BoardDay, BoardCard, BoardSeat };
import {
  assignPanelSeatAction,
  reassignPanelSeatAction,
  unassignPanelSeatAction,
  respondToSeatApprovalAction,
  cancelSeatApprovalAction,
} from "./actions";

/** "Amine Hammami" → "AH". Falls back to one letter for single-word names. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The interview panel board — a card per scheduled applicant, each holding one
 * seat per kind (the three committees, plus a floating seat on 4-seat panels).
 *
 * Read-only by default. Seats are staffed by the lead who owns them, not
 * claimed by whoever gets there first: a committee's lead rosters their own
 * members onto that committee's seat. An ordinary member sees the board exactly
 * as it stands and has no controls at all — which is the point of the rework.
 *
 * The one exception is the Club Lead, who may ask another committee's lead for
 * their seat; that request appears here for both parties until it is answered.
 *
 * Colour is reserved strictly for seat *state*: green for filled and for a
 * complete panel, amber for a panel still short of interviewers or a request
 * awaiting an answer. Committee chips stay neutral — the palette's only
 * semantic colours are accepted/rejected/pending, and tinting an EER chip red
 * would collide with "rejected" everywhere else in the app.
 */
export function PanelBoard({
  campaignId,
  days,
  currentUserId,
  assignableByKind,
  isReadOnly,
}: {
  campaignId: string;
  days: BoardDay[];
  currentUserId: string;
  /** Members this viewer may put in each seat kind they own. */
  assignableByKind: Record<string, PanelCandidate[]>;
  /** True when this viewer owns no seats and holds no pending request. */
  isReadOnly: boolean;
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
              Interview Panel Board
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {isReadOnly
                ? "Who is sitting on each interview panel. Your committee's lead assigns these seats."
                : "Assign your committee's members to their seat on each panel."}
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
          applicant&apos;s panel appears here to be staffed.
        </p>
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <DaySection
              key={day.dateKey}
              campaignId={campaignId}
              day={day}
              currentUserId={currentUserId}
              assignableByKind={assignableByKind}
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
  assignableByKind,
}: {
  campaignId: string;
  day: BoardDay;
  currentUserId: string;
  assignableByKind: Record<string, PanelCandidate[]>;
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
                  assignableByKind={assignableByKind}
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
  assignableByKind,
}: {
  campaignId: string;
  card: BoardCard;
  currentUserId: string;
  assignableByKind: Record<string, PanelCandidate[]>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The one success worth saying out loud: a Club Lead's assignment that became
  // a request. Every other action shows its result in the seat itself.
  const [notice, setNotice] = useState<string | null>(null);

  const filled = card.seats.filter((s) => s.claimedById !== null).length;
  const complete = filled === card.seats.length && card.seats.length > 0;
  // Note the two distinct meanings of "complete" on this card: `complete` is
  // seat staffing (every seat filled), `card.interviewDone` is the interview
  // itself having happened and been written up. They move independently.
  const done = card.interviewDone;

  function run(
    action: () => Promise<{
      ok: boolean;
      error?: string;
      awaitingApproval?: boolean;
    }>,
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else if (res.awaitingApproval) {
        setNotice("Sent to that seat's lead to approve.");
      }
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
            {/* The committee this applicant applied to. Shown to every viewer,
                because it is what makes the seats below readable: it names which
                seat is the applicant's own committee and which are the
                cross-committee check the panel exists to provide.

                Deliberately neutral, not tinted — the palette's only semantic
                colours are accepted/rejected/pending, and an EER chip in red
                would read as "rejected" everywhere else in the app. The short
                code keeps the card legible at thirds-width; the full name is on
                the tooltip rather than wrapping the header to three lines. */}
            <p
              className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400"
              title={committeeLabel(card.preferredCommittee)}
            >
              <Icon name="groups" className="text-[14px]" />
              Applied to {card.preferredCommittee}
            </p>
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

        {/* One pip per seat, filled in the same order as the rows below. The
            footer already states the count in words; this is for scanning a grid
            of cards for the half-empty one without reading any of them, which is
            the whole reason this section is a board. */}
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

      {/* Seats, always MKT → TM → EER → Floating */}
      <div className="flex-1 space-y-2 p-4">
        {card.seats.map((seat) => (
          <SeatRow
            key={seat.seatId}
            seat={seat}
            pending={pending}
            isMine={seat.claimedById === currentUserId}
            currentUserId={currentUserId}
            assignable={assignableByKind[seat.kind] ?? []}
            onAssign={(assigneeId) =>
              run(() => assignPanelSeatAction(campaignId, seat.seatId, assigneeId))
            }
            onReassign={(assigneeId) =>
              run(() =>
                reassignPanelSeatAction(campaignId, seat.seatId, assigneeId),
              )
            }
            onUnassign={() =>
              run(() => unassignPanelSeatAction(campaignId, seat.seatId))
            }
            onRespond={(requestId, approve) =>
              run(() =>
                respondToSeatApprovalAction(campaignId, requestId, approve),
              )
            }
            onWithdraw={(requestId) =>
              run(() => cancelSeatApprovalAction(campaignId, requestId))
            }
          />
        ))}
        {error && (
          <p className="rounded-lg bg-status-rejected/10 px-3 py-2 text-xs text-status-rejected">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg bg-status-pending/10 px-3 py-2 text-xs text-[color:var(--status-pending)]">
            {notice}
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
  currentUserId,
  assignable,
  onAssign,
  onReassign,
  onUnassign,
  onRespond,
  onWithdraw,
}: {
  seat: BoardSeat;
  pending: boolean;
  isMine: boolean;
  currentUserId: string;
  assignable: PanelCandidate[];
  onAssign: (assigneeId: string) => void;
  onReassign: (assigneeId: string) => void;
  onUnassign: () => void;
  onRespond: (requestId: string, approve: boolean) => void;
  onWithdraw: (requestId: string) => void;
}) {
  const reduced = useReducedMotion();
  const [picking, setPicking] = useState(false);
  const filled = seat.claimedById !== null;
  // One picker, two meanings: on an empty seat it fills, on a filled one it
  // swaps the occupant. Kept as a single control because the choice being made
  // — which member sits here — is the same either way.
  const mayStaff = seat.canAssign || seat.canRequest;

  /**
   * A one-shot wash of colour over the seat after it changes.
   *
   * Staffing a seat is a server round-trip that changes one row inside a grid of
   * cards, and the resulting difference — a name where "Unassigned" used to be —
   * is easy to miss when you are looking at the control you just used. The flash
   * draws the eye to the row that changed.
   *
   * Driven by the ACTION rather than by watching `seat.claimedById`,
   * deliberately: a prop-watching flash would also fire for every already-filled
   * seat on first paint, lighting up the whole board on page load. `nonce` lets
   * a repeated action re-trigger it. Green for filling, amber for emptying — the
   * same tokens those two states mean everywhere else in the app.
   */
  const [flash, setFlash] = useState<{
    kind: "fill" | "empty";
    nonce: number;
  } | null>(null);

  const trigger = (kind: "fill" | "empty") => {
    if (reduced) return;
    setFlash((f) => ({ kind, nonce: (f?.nonce ?? 0) + 1 }));
  };

  const request = seat.pendingRequest;
  const isMyRequest = request?.requestedById === currentUserId;

  // Swapping a seat's occupant shouldn't offer the person already in it — the
  // server refuses that anyway, so it would only be a dead entry in the list.
  const choices = filled
    ? assignable.filter((m) => m.id !== seat.claimedById)
    : assignable;

  return (
    <div
      className={`relative isolate overflow-hidden rounded-lg px-3 py-2 transition-colors duration-200 ease-out motion-reduce:transition-none ${
        filled
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
              flash.kind === "fill" ? "bg-status-accepted" : "bg-status-pending"
            }`}
          />
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
            {seatKindLabel(seat.kind)}
          </span>
          {filled ? (
            <span className="flex min-w-0 items-center gap-2">
              {/* An initials chip for the holder, so a filled seat reads as "a
                  person is in it" at a glance — the board equivalent of an
                  assignee avatar. Tinted with primary rather than the seat's
                  status green, so it identifies rather than restating "filled". */}
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
          ) : seat.awaitingApproval ? (
            /* Spoken for but not filled. Shown to everyone, so no second lead
               assigns over the top of a request already in flight. */
            <span className="truncate text-sm font-medium text-[color:var(--status-pending)]">
              Pending approval
            </span>
          ) : (
            <span className="truncate text-sm italic text-neutral-500 dark:text-neutral-400">
              Unassigned
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {filled && seat.canAssign && !picking && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              title="Put a different interviewer in this seat"
              onClick={() => setPicking(true)}
            >
              Change
            </Button>
          )}
          {filled && seat.canAssign && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              title="Remove this interviewer from the panel"
              onClick={() => {
                trigger("empty");
                onUnassign();
              }}
            >
              Remove
            </Button>
          )}
          {/* The padlock only earns its space when there is no button beside it:
              with one present, the control already says the seat is settled, and
              the row is tight enough at two-up that ~22px of redundant chrome is
              what pushes the interviewer's name into an ellipsis. */}
          {filled && !seat.canAssign && (
            <Icon name="lock" className="text-[16px] text-status-accepted" />
          )}
          {!filled && mayStaff && !picking && (
            <Button
              size="sm"
              variant={seat.canAssign ? "default" : "ghost"}
              disabled={pending}
              title={
                seat.canAssign
                  ? undefined
                  : "Propose someone for this seat — this committee's lead has to approve it"
              }
              onClick={() => setPicking(true)}
            >
              {seat.canAssign ? "Assign" : "Request"}
            </Button>
          )}
          {/* Nothing to offer this viewer: shown as open so the card reads
              honestly, but with no affordance. */}
          {!filled && !mayStaff && !request && !seat.awaitingApproval && (
            <span className="text-xs font-medium text-neutral-400">Open</span>
          )}
        </div>
      </div>

      {/* Member picker — a plain select of the members this lead may seat here,
          rather than a modal: the choice is short and the row is already the
          context, so a dialog would be more ceremony than the action needs. */}
      {picking && (filled ? seat.canAssign : mayStaff) && (
        <div className="mt-2 flex items-center gap-2">
          <select
            autoFocus
            defaultValue=""
            disabled={pending}
            aria-label={`Choose a member for the ${seatKindLabel(seat.kind)} seat`}
            onChange={(e) => {
              const value = e.target.value;
              if (!value) return;
              setPicking(false);
              trigger("fill");
              if (filled) onReassign(value);
              else onAssign(value);
            }}
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="" disabled>
              {choices.length === 0
                ? "No eligible members"
                : "Choose a member…"}
            </option>
            {choices.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setPicking(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* A pending Club Lead request. Rendered for both sides: the lead who has
          to answer it, and the requester waiting on it — so neither is left
          guessing whether it went anywhere. Amber, like everything else in the
          app that means "waiting on a human". */}
      {request && !filled && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-status-pending/10 px-2.5 py-1.5">
          <span className="text-xs text-[color:var(--status-pending)]">
            {isMyRequest
              ? `Your request to seat ${request.assigneeName} is awaiting this seat's lead.`
              : `${request.requestedByName} is asking for this seat for ${request.assigneeName}.`}
          </span>
          <span className="flex items-center gap-1.5">
            {seat.canRespond && (
              <>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    trigger("fill");
                    onRespond(request.requestId, true);
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => onRespond(request.requestId, false)}
                >
                  Decline
                </Button>
              </>
            )}
            {isMyRequest && !seat.canRespond && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => onWithdraw(request.requestId)}
              >
                Withdraw
              </Button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

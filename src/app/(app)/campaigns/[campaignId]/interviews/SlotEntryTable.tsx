"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pager } from "@/components/ui/pager";
import { Icon } from "@/components/app-shell/icon";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ClearImpact } from "@/lib/interview-slot";
import { BookingStatusBadge, type BookingState } from "./booking-status-badge";
import { saveInterviewSlotAction } from "./actions";

export type SlotRow = {
  applicantId: string;
  fullName: string;
  /** "" when unbooked; otherwise the Tunis wall-clock a datetime-local wants. */
  scheduledTimeInput: string;
  room: string;
  /** False for a shortlisted applicant with no InterviewSlot row yet. */
  invited: boolean;
};

/**
 * Manual slot-time entry. Applicants book themselves through the club's external
 * calendar link, so nothing populates these fields automatically — a coordinator
 * transcribes each booking here, which is what turns a row from "not yet booked"
 * into "Scheduled".
 *
 * Only rendered for ENTER_INTERVIEW_SLOT holders — the page wraps it in a
 * <PermissionGate>, so there is no read-only variant to handle here. The save
 * action re-checks the permission regardless.
 */
const PAGE_SIZE = 10;

/** What's typed into one row's inputs but not saved yet. */
type Draft = { time: string; room: string };

/** One row's draft plus the setter, handed to whichever layout renders it. */
type DraftBinding = {
  draft: Draft | undefined;
  /** null clears it — after a save, or when the inputs match what's saved. */
  setDraft: (draft: Draft | null) => void;
};

export function SlotEntryTable({
  campaignId,
  rows,
}: {
  campaignId: string;
  rows: SlotRow[];
}) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  // The working set while transcribing: everyone still without a time.
  const [unbookedOnly, setUnbookedOnly] = useState(false);
  // Drafts live HERE, keyed by applicant, rather than in each row: a row only
  // exists while its page is showing, so row-local drafts were silently thrown
  // away by a page change (or a search) before they were saved.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const term = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (term === "" || r.fullName.toLowerCase().includes(term)) &&
      (!unbookedOnly || r.scheduledTimeInput === ""),
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = visible.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  // Counted against the server's rows (fresh after every save's revalidate),
  // so it says exactly how many rows still need their Save pressed.
  const unsaved = rows.filter((r) => {
    const d = drafts[r.applicantId];
    return d && (d.time !== r.scheduledTimeInput || d.room !== r.room);
  }).length;

  const bind = (row: SlotRow): DraftBinding => ({
    draft: drafts[row.applicantId],
    setDraft: (draft) =>
      setDrafts((prev) => {
        const next = { ...prev };
        if (draft) next[row.applicantId] = draft;
        else delete next[row.applicantId];
        return next;
      }),
  });

  return (
    <div className="space-y-5 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="event" className="text-[20px]" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Interview Slots
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Record the time each applicant booked on the calendar. The room is
            optional — it can stay empty until it&apos;s confirmed.
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        // Same search treatment as Phase 2's ranked list. Changing either
        // control returns to page 1 — the old page number means nothing in
        // the new result.
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 basis-56">
            <Icon
              name="search"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-neutral-400"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name…"
              aria-label="Search shortlisted applicants by name"
              className="pl-9"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={unbookedOnly}
              onChange={(e) => {
                setUnbookedOnly(e.target.checked);
                setPage(1);
              }}
              className="size-4 accent-primary"
            />
            Not yet booked only
          </label>
          {/* Drafts survive paging and searching, so this is a reminder, not
              a warning: nothing is lost, but nothing is saved until Save. */}
          <p role="status" className="text-sm text-status-pending-text">
            {unsaved > 0 &&
              `${unsaved} unsaved row${unsaved === 1 ? "" : "s"}`}
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No shortlisted applicants yet. Finalize Phase 1 first.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {unbookedOnly && term === ""
            ? "Everyone has a time recorded."
            : "No applicant matches this search."}
        </p>
      ) : (
        <>
          {/* lg and up: the table. It stays a table because the two inputs line
              up into columns you can run down while transcribing a list of
              bookings, which is exactly what this screen is for.

              lg rather than the md used by the Applicants and Selection tables,
              because this one is genuinely wider: a datetime-local input renders
              at 216px, and with the room field and Save button the row needs
              ~700px. At 768px the 256px sidebar leaves only ~512px of content, so
              an md breakpoint overflowed the page (measured 967px against a 768px
              viewport). overflow-x-auto stays as a floor so that even if a future
              column pushes past the available width it scrolls inside the panel
              instead of breaking the page. */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
                  <Th>Applicant</Th>
                  <Th>Status</Th>
                  <Th>Date &amp; time (Tunis)</Th>
                  <Th>Room</Th>
                  <Th className="text-right">Save</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <SlotTableRow
                    key={row.applicantId}
                    campaignId={campaignId}
                    row={row}
                    {...bind(row)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Below lg: a card per applicant, matching the collapse used on
              Applicants and Phase 1 Selection. This one has the strongest case of
              the three — the old min-w-[720px] table meant typing into a field
              that was half off-screen while the name it belonged to had scrolled
              away. In a card both inputs go full-width instead. */}
          <ul className="divide-y divide-neutral-100 lg:hidden dark:divide-neutral-800/60">
            {pageRows.map((row) => (
              <SlotCard
                key={row.applicantId}
                campaignId={campaignId}
                row={row}
                {...bind(row)}
              />
            ))}
          </ul>
        </>
      )}

      {visible.length > PAGE_SIZE && (
        <Pager
          page={safePage}
          pageCount={pageCount}
          total={visible.length}
          pageSize={PAGE_SIZE}
          rowCount={pageRows.length}
          unit="applicant"
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400 ${className}`}
    >
      {children}
    </th>
  );
}

/**
 * The draft/committed state for one applicant's slot, plus the save.
 *
 * A hook rather than duplicated state, because the table row and the card below
 * md are two renderings of the same editable row — if they each kept their own
 * copy of this logic the "Saved" indicator and the dirty-check would inevitably
 * drift apart between the two layouts.
 *
 * The typed-but-unsaved values come from the table (`binding`), not from state
 * in here — see SlotEntryTable — so they outlive this row being paged away.
 */
function useSlotDraft(
  campaignId: string,
  row: SlotRow,
  { draft, setDraft }: DraftBinding,
) {
  // The staffed-panel warning the server sent back, held until the user answers
  // it. Non-null is exactly "the dialog is open", so there is no second piece of
  // state that could disagree with it about whether we are waiting on an answer.
  const [clearImpact, setClearImpact] = useState<ClearImpact | null>(null);
  // `saved` is what's committed to the database, `time`/`room` are the draft in
  // the inputs. The badge reads `saved` so it only flips to "Scheduled" once the
  // write actually lands, never merely because someone typed into the field.
  const [saved, setSaved] = useState({
    time: row.scheduledTimeInput,
    room: row.room,
  });
  const time = draft?.time ?? saved.time;
  const room = draft?.room ?? saved.room;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = time !== saved.time || room !== saved.room;

  // Typing back to the saved value drops the draft, so the table's unsaved
  // count never counts a row that has nothing left to save.
  const edit = (next: Draft) =>
    setDraft(next.time === saved.time && next.room === saved.room ? null : next);

  // Once a time is recorded the row is Scheduled; before that it's waiting on
  // the applicant, unless they were never sent the link in the first place.
  const state: BookingState =
    saved.time !== ""
      ? "SCHEDULED"
      : row.invited
        ? "NOT_BOOKED"
        : "NOT_INVITED";

  // `confirmClear` is only ever true on the second attempt, after the user
  // answered the dialog — the first save always asks the server, and the server
  // is what decides whether there is anything to warn about.
  function save(confirmClear = false) {
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      const res = await saveInterviewSlotAction(
        campaignId,
        row.applicantId,
        time,
        room,
        confirmClear,
      );
      if (!res.ok) {
        // A refusal carrying an impact isn't an error the user did anything
        // about — it's a question. Raise the dialog instead of the red text.
        if (res.clearImpact) {
          setClearImpact(res.clearImpact);
          return;
        }
        setError(res.error);
        return;
      }
      setSaved({ time, room });
      setDraft(null);
      setJustSaved(true);
    });
  }

  return {
    time,
    setTime: (value: string) => edit({ time: value, room }),
    room,
    setRoom: (value: string) => edit({ time, room: value }),
    /** Enter in either input saves, so a row is typed and committed without
     *  reaching for the mouse — the transcription loop this table is for. */
    saveOnEnter: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && dirty && !pending) {
        e.preventDefault();
        save();
      }
    },
    pending,
    error,
    justSaved,
    dirty,
    state,
    save,
    clearImpact,
    dismissClearWarning: () => setClearImpact(null),
    confirmClear: () => {
      setClearImpact(null);
      save(true);
    },
  };
}

/** The two layouts' shared confirmation for clearing a staffed panel's time. */
function ClearSlotConfirm({
  fullName,
  impact,
  onDismiss,
  onConfirm,
}: {
  fullName: string;
  impact: ClearImpact | null;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  // Both counts are worth stating separately: an assigned seat is someone who
  // thinks they are interviewing this applicant, a pending request is a lead
  // waiting to answer something they will no longer be able to reach. They also
  // have different outcomes — the seat survives the clear, the request does not
  // — so the copy branches on each rather than lumping them together.
  const seatCount = impact?.assignedSeats ?? 0;
  const requestCount = impact?.pendingRequests ?? 0;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  const parts: string[] = [];
  if (seatCount > 0) parts.push(plural(seatCount, "assigned seat"));
  if (requestCount > 0) parts.push(plural(requestCount, "pending seat request"));

  return (
    <ConfirmDialog
      open={impact !== null}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
      title="Clear this interview time?"
      description={
        <>
          {fullName}&apos;s panel already has {parts.join(" and ")}. Clearing the
          time takes them off the panel board, so nobody can see or change that
          staffing until a new time is entered.
          {seatCount > 0 && (
            <>
              {" "}
              The {seatCount === 1 ? "interviewer keeps their seat" : "interviewers keep their seats"}
              {" "}— re-entering a time brings the panel back exactly as it is now.
            </>
          )}
          {/* Stated outright, because it is the one thing here that does not
              come back: a request can only be answered from the card that is
              about to disappear, so it is closed out rather than left to sit
              PENDING forever, blocking its seat. */}
          {requestCount > 0 && (
            <>
              <br />
              <br />
              {requestCount === 1
                ? "The pending request will be declined automatically"
                : "The pending requests will be declined automatically"}
              , since {requestCount === 1 ? "it" : "they"} could no longer be
              answered. The {requestCount === 1 ? "seat" : "seats"} can be asked
              for again once the interview is rescheduled.
            </>
          )}
        </>
      }
      confirmLabel="Clear the time"
      destructive
      onConfirm={onConfirm}
    />
  );
}

/** The save button plus its inline error / "Saved" acknowledgement. */
function SaveCell({
  error,
  justSaved,
  dirty,
  pending,
  onSave,
}: {
  error: string | null;
  justSaved: boolean;
  dirty: boolean;
  pending: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      {error && (
        <span role="alert" className="text-xs text-status-rejected-text">
          {error}
        </span>
      )}
      {/* Always mounted, so screen readers announce "Saved" when it appears —
          a live region inserted at the same moment as its text often isn't. */}
      <span role="status" className="flex items-center gap-1 text-xs text-status-accepted-text">
        {!error && justSaved && !dirty && (
          <>
            <Icon name="check" className="text-[14px]" />
            Saved
          </>
        )}
      </span>
      {/* Wrapped, not passed by reference: `save` takes a confirmClear flag,
          and handing it straight to onClick would feed it the MouseEvent —
          truthy, so every save would silently claim to be confirmed. */}
      <Button
        size="sm"
        variant="outline"
        disabled={pending || !dirty}
        onClick={() => onSave()}
      >
        Save
      </Button>
    </div>
  );
}

function SlotTableRow({
  campaignId,
  row,
  ...binding
}: {
  campaignId: string;
  row: SlotRow;
} & DraftBinding) {
  const d = useSlotDraft(campaignId, row, binding);

  return (
    <tr className="border-b border-neutral-100 align-middle dark:border-neutral-800/60">
      <td className="px-3 py-2 font-medium text-foreground">{row.fullName}</td>
      <td className="px-3 py-2">
        <BookingStatusBadge value={d.state} />
      </td>
      <td className="px-3 py-2">
        <Input
          type="datetime-local"
          value={d.time}
          disabled={d.pending}
          aria-label={`Interview date and time for ${row.fullName}`}
          onChange={(e) => d.setTime(e.target.value)}
          onKeyDown={d.saveOnEnter}
          className="w-[13.5rem]"
        />
      </td>
      <td className="px-3 py-2">
        <Input
          type="text"
          value={d.room}
          disabled={d.pending}
          placeholder="TBC"
          aria-label={`Interview room for ${row.fullName}`}
          onChange={(e) => d.setRoom(e.target.value)}
          onKeyDown={d.saveOnEnter}
          className="w-32"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <SaveCell
          error={d.error}
          justSaved={d.justSaved}
          dirty={d.dirty}
          pending={d.pending}
          onSave={d.save}
        />
        <ClearSlotConfirm
          fullName={row.fullName}
          impact={d.clearImpact}
          onDismiss={d.dismissClearWarning}
          onConfirm={d.confirmClear}
        />
      </td>
    </tr>
  );
}

/** The same editable row at phone width: name and status on top, then the two
 *  fields full-width where they have room to be typed into. */
function SlotCard({
  campaignId,
  row,
  ...binding
}: { campaignId: string; row: SlotRow } & DraftBinding) {
  const d = useSlotDraft(campaignId, row, binding);

  return (
    <li className="space-y-3 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 font-medium text-foreground">
          {row.fullName}
        </p>
        <BookingStatusBadge value={d.state} />
      </div>

      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Date &amp; time (Tunis)
          </span>
          <Input
            type="datetime-local"
            value={d.time}
            disabled={d.pending}
            aria-label={`Interview date and time for ${row.fullName}`}
            onChange={(e) => d.setTime(e.target.value)}
            onKeyDown={d.saveOnEnter}
            className="w-full"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Room
          </span>
          <Input
            type="text"
            value={d.room}
            disabled={d.pending}
            placeholder="TBC"
            aria-label={`Interview room for ${row.fullName}`}
            onChange={(e) => d.setRoom(e.target.value)}
            onKeyDown={d.saveOnEnter}
            className="w-full"
          />
        </label>
      </div>

      <SaveCell
        error={d.error}
        justSaved={d.justSaved}
        dirty={d.dirty}
        pending={d.pending}
        onSave={d.save}
      />

      <ClearSlotConfirm
        fullName={row.fullName}
        impact={d.clearImpact}
        onDismiss={d.dismissClearWarning}
        onConfirm={d.confirmClear}
      />
    </li>
  );
}

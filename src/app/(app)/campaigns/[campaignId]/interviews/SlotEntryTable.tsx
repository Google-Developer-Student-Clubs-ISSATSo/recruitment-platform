"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pager } from "@/components/ui/pager";
import { Icon } from "@/components/app-shell/icon";
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

export function SlotEntryTable({
  campaignId,
  rows,
}: {
  campaignId: string;
  rows: SlotRow[];
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-5 rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
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

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No shortlisted applicants yet. Finalize Phase 1 first.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
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
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > PAGE_SIZE && (
        <Pager
          page={safePage}
          pageCount={pageCount}
          total={rows.length}
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
      className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-neutral-400 ${className}`}
    >
      {children}
    </th>
  );
}

function SlotTableRow({
  campaignId,
  row,
}: {
  campaignId: string;
  row: SlotRow;
}) {
  // `saved` is what's committed to the database, `time`/`room` are the draft in
  // the inputs. The badge reads `saved` so it only flips to "Scheduled" once the
  // write actually lands, never merely because someone typed into the field.
  const [saved, setSaved] = useState({
    time: row.scheduledTimeInput,
    room: row.room,
  });
  const [time, setTime] = useState(row.scheduledTimeInput);
  const [room, setRoom] = useState(row.room);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = time !== saved.time || room !== saved.room;

  // Once a time is recorded the row is Scheduled; before that it's waiting on
  // the applicant, unless they were never sent the link in the first place.
  const state: BookingState =
    saved.time !== ""
      ? "SCHEDULED"
      : row.invited
        ? "NOT_BOOKED"
        : "NOT_INVITED";

  function save() {
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      const res = await saveInterviewSlotAction(
        campaignId,
        row.applicantId,
        time,
        room,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved({ time, room });
      setJustSaved(true);
    });
  }

  return (
    <tr className="border-b border-neutral-100 align-middle dark:border-neutral-800/60">
      <td className="px-3 py-2 font-medium text-foreground">{row.fullName}</td>
      <td className="px-3 py-2">
        <BookingStatusBadge value={state} />
      </td>
      <td className="px-3 py-2">
        <Input
          type="datetime-local"
          value={time}
          disabled={pending}
          aria-label={`Interview date and time for ${row.fullName}`}
          onChange={(e) => setTime(e.target.value)}
          className="w-[13.5rem]"
        />
      </td>
      <td className="px-3 py-2">
        <Input
          type="text"
          value={room}
          disabled={pending}
          placeholder="TBC"
          aria-label={`Interview room for ${row.fullName}`}
          onChange={(e) => setRoom(e.target.value)}
          className="w-32"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          {error && (
            <span className="text-xs text-status-rejected">{error}</span>
          )}
          {!error && justSaved && !dirty && (
            <span className="flex items-center gap-1 text-xs text-status-accepted">
              <Icon name="check" className="text-[14px]" />
              Saved
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !dirty}
            onClick={save}
          >
            Save
          </Button>
        </div>
      </td>
    </tr>
  );
}

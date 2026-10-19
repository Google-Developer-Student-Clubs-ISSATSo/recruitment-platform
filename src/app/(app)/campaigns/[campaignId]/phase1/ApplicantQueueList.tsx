"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";

import { Icon } from "@/components/app-shell/icon";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";

export type QueueEntry = {
  id: string;
  fullName: string;
  complete: boolean;
  scoredCount: number;
  totalQuestions: number;
};

// The browsable applicant rail. Not forward-only — clicking anyone loads them
// into the scoring view, so reviewers can revisit and edit. Each entry shows a
// completion indicator (fully scored vs. incomplete) reflecting combined
// progress across all scorers.
//
// Rail-local view controls — a case-insensitive name search and an "Unscored
// only" filter (scoredCount < totalQuestions, off by default) — narrow what
// the rail shows without ever touching the selection: the currently selected
// applicant stays selected AND visible even when filtered out.
//
// The active row carries a shared-element bar (`layoutId`) rather than a static
// border, so moving down the queue slides the marker instead of blinking it from
// one row to another — the same treatment the Applicants pager uses for its
// current-page pill, so "where am I" reads the same way in both places.
export function ApplicantQueueList({
  entries,
  selectedId,
  onSelect,
}: {
  entries: QueueEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const reduced = useReducedMotion();

  // Rail-local view controls: a name search and an "Unscored only" filter.
  // They never touch the selection — who is open in the detail pane is the
  // parent's concern. The active applicant is always kept visible, so
  // filtering can never silently orphan the row being worked on.
  const [query, setQuery] = useState("");
  const [unscoredOnly, setUnscoredOnly] = useState(false);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredEntries = useMemo(
    () =>
      entries.filter((e) => {
        // The selected applicant never gets filtered away — keep them
        // selected AND visible rather than switching the selection.
        if (e.id === selectedId) return true;
        if (unscoredOnly && e.complete) return false;
        if (
          normalizedQuery &&
          !e.fullName.toLowerCase().includes(normalizedQuery)
        ) {
          return false;
        }
        return true;
      }),
    [entries, selectedId, unscoredOnly, normalizedQuery],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
        Queue ·{" "}
        {filteredEntries.length === entries.length
          ? entries.length
          : `${filteredEntries.length} of ${entries.length}`}
      </div>
      {/* Search + filter row: sits above the scrolling list, below the header
          strip, so it scrolls with neither. The input follows the textarea's
          token treatment (hairline border, ring focus) at the rail's compact
          h-7 height. */}
      <div className="flex items-center gap-1.5 border-b border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          aria-label="Search applicants by name"
          className="h-7 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm text-foreground outline-none transition-colors duration-150 ease-out placeholder:text-neutral-400 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none dark:border-neutral-800 dark:bg-neutral-900 dark:placeholder:text-neutral-500"
        />
        <button
          type="button"
          aria-pressed={unscoredOnly}
          onClick={() => setUnscoredOnly((v) => !v)}
          className={`flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors duration-150 ease-out motion-reduce:transition-none ${
            unscoredOnly
              ? "border-primary bg-primary/10 text-primary"
              : "border-neutral-200 text-neutral-500 hover:border-neutral-300 dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-700"
          }`}
        >
          <Icon name="filter_alt" className="text-[14px]" />
          Unscored only
        </button>
      </div>
      {/* Capped height on desktop so the rail scrolls independently of the detail
          pane. Below lg the rail IS the whole screen (see the pane switching in
          Phase1ScoringClient), so it scrolls with the page instead — a 70vh box
          inside a full-page scroll is two nested scrollbars fighting each other. */}
      <ul className="divide-y divide-neutral-100 lg:max-h-[70vh] lg:overflow-y-auto dark:divide-neutral-800/60">
        {entries.length === 0 ? (
          // Below lg the rail is the only visible pane, so the message lives
          // here; at lg+ it is hidden and the detail pane's dashed empty
          // state (same copy, plus context) takes over — one message per
          // screen, never both.
          <li className="px-4 py-8 text-center text-sm italic text-neutral-400 lg:hidden">
            No applicants to score.
          </li>
        ) : filteredEntries.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm italic text-neutral-400">
            No applicants match — try a different name or clear “Unscored
            only”.
          </li>
        ) : (
          filteredEntries.map((e) => {
            const active = e.id === selectedId;
            return (
              <li key={e.id} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(e.id)}
                  aria-current={active}
                  className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors duration-150 ease-out motion-reduce:transition-none ${
                    active
                      ? "bg-primary/10"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                  }`}
                >
                  {active && (
                    <motion.span
                      aria-hidden
                      layoutId="phase1-queue-active"
                      layout={!reduced}
                      transition={
                        reduced
                          ? { duration: 0 }
                          : { duration: DURATION.base, ease: EASE.inOut }
                      }
                      className="absolute inset-y-0 left-0 w-1 rounded-r bg-primary"
                    />
                  )}
                  {e.complete ? (
                    <Icon
                      name="check_circle"
                      className="text-[20px] text-status-accepted"
                    />
                  ) : (
                    <Icon
                      name="radio_button_unchecked"
                      className="text-[20px] text-neutral-300 dark:text-neutral-600"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-medium ${
                        active ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {e.fullName}
                    </span>
                    <span className="block text-[11px] text-neutral-400">
                      {e.complete
                        ? "Fully scored"
                        : `${e.scoredCount}/${e.totalQuestions} scored`}
                    </span>
                  </span>
                  {/* Below lg, tapping a row swaps the page over to a separate
                      detail pane, so the row has to look like it goes somewhere.
                      From lg up the detail is already on screen beside it and a
                      chevron would be a lie. */}
                  <Icon
                    name="chevron_right"
                    className="text-[18px] text-neutral-300 lg:hidden dark:text-neutral-600"
                  />
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

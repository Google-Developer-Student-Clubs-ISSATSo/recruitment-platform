"use client";

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

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
        Queue · {entries.length}
      </div>
      {/* Capped height on desktop so the rail scrolls independently of the detail
          pane. Below lg the rail IS the whole screen (see the pane switching in
          Phase1ScoringClient), so it scrolls with the page instead — a 70vh box
          inside a full-page scroll is two nested scrollbars fighting each other. */}
      <ul className="divide-y divide-neutral-100 lg:max-h-[70vh] lg:overflow-y-auto dark:divide-neutral-800/60">
        {entries.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm italic text-neutral-400">
            No applicants to score.
          </li>
        ) : (
          entries.map((e) => {
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

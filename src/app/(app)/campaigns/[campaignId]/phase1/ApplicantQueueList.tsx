"use client";

import { Icon } from "@/components/app-shell/icon";

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
export function ApplicantQueueList({
  entries,
  selectedId,
  onSelect,
}: {
  entries: QueueEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
        Queue · {entries.length}
      </div>
      <ul className="max-h-[70vh] divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800/60">
        {entries.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm italic text-neutral-400">
            No applicants to score.
          </li>
        ) : (
          entries.map((e) => {
            const active = e.id === selectedId;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelect(e.id)}
                  aria-current={active}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                    active
                      ? "bg-primary/10"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                  }`}
                >
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
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

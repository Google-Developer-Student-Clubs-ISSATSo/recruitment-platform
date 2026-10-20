"use client";

import { Icon } from "@/components/app-shell/icon";

// Combined progress across ALL scorers (screeners + technical), not just the
// current viewer's own entries. An applicant is "processed" only when every
// active question has a score, regardless of who entered which value.
//
// Rendered inside the page-title block as a slim inline strip. The previous
// full-width bordered banner cost ~90px of vertical chrome above the
// workstation — a third band the eye climbed before content started — to say
// exactly what this row says beside the heading. The team-wide caveat keeps
// its full wording on hover (title) and a short "team-wide" tag inline, so the
// reviewer who wonders whether the number will reach zero on their work alone
// still gets the answer without a caption line of its own.
export function ProcessedRemainingCounter({
  processed,
  total,
}: {
  processed: number;
  total: number;
}) {
  const remaining = total - processed;
  const pct = total === 0 ? 0 : Math.round((processed / total) * 100);
  return (
    <div
      title="Team-wide — counts all scorers combined, not just your own entries."
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1"
    >
      <div className="flex items-center gap-1.5">
        <Icon name="task_alt" className="text-base text-status-accepted" />
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          Processed
        </span>
        <span className="text-sm font-bold tabular-nums text-foreground">
          {processed}
        </span>
      </div>
      <span className="text-neutral-300 dark:text-neutral-600">/</span>
      <div className="flex items-center gap-1.5">
        <Icon name="pending" className="text-base text-status-pending" />
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          Remaining
        </span>
        <span className="text-sm font-bold tabular-nums text-foreground">
          {remaining}
        </span>
      </div>
      {/* Grows as applicants complete. 300ms is the `slow` token — the bar
          only moves when a whole applicant flips to processed, which is rare
          enough to be worth seeing travel. */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
          <div
            className="h-full rounded-full bg-status-accepted transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {pct}%
        </span>
      </div>
      <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
        team-wide
      </span>
    </div>
  );
}

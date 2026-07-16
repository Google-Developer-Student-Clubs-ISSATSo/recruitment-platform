"use client";

import { Icon } from "@/components/app-shell/icon";

// Combined progress across ALL scorers (screeners + technical), not just the
// current viewer's own entries. An applicant is "processed" only when every
// active question has a score, regardless of who entered which value.
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
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-3.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-2">
        <Icon name="task_alt" className="text-[20px] text-status-accepted" />
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          Processed
        </span>
        <span className="text-lg font-bold tabular-nums text-foreground">
          {processed}
        </span>
      </div>
      <span className="text-neutral-300 dark:text-neutral-600">/</span>
      <div className="flex items-center gap-2">
        <Icon
          name="pending"
          className="text-[20px] text-[color:var(--status-pending)]"
        />
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          Remaining
        </span>
        <span className="text-lg font-bold tabular-nums text-foreground">
          {remaining}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="h-2 w-28 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
          <div
            className="h-full rounded-full bg-status-accepted transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {pct}%
        </span>
      </div>
    </div>
  );
}

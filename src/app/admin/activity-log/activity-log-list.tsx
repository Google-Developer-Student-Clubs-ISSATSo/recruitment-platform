"use client";

import {
  describeActivity,
  timeAgo,
  type ActivityItem,
} from "@/lib/activity-descriptions";

// Minimal activity-log list. Filtering + pagination are planned for a later
// stage; for now this is a clean, read-only reverse-chronological list so the
// notification bell's "View all" link has a real destination.
export function ActivityLogList({ items }: { items: ActivityItem[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Activity Log</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Every mutating action across the platform, most recent first.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm italic text-neutral-400">
            No activity recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{item.actorName}</span>{" "}
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {describeActivity(item.actionType)}
                  </span>
                </p>
                <span className="shrink-0 text-xs text-neutral-400">
                  {timeAgo(item.createdAtISO)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

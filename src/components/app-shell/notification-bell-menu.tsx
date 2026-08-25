"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  describeActivity,
  timeAgo,
  type ActivityItem,
} from "@/lib/activity-descriptions";
import { usePolling } from "@/lib/use-polling";
import { markActivityViewed, getNotificationState } from "./notification-actions";

const POLL_INTERVAL_MS = 30_000;

// Client half of the notification bell: the Popover trigger + recent-activity
// preview, kept live by polling getNotificationState() on the same
// visibility-aware interval the Applicants page's auto-refresh uses.
// Permission gating and the initial fetch live in the server-side
// <NotificationBell> that renders this — a user without VIEW_ACTIVITY_LOG
// never mounts this component, so no polling ever starts for them.
export function NotificationBellMenu({
  initialItems,
  initialLastViewedActivityAt,
}: {
  initialItems: ActivityItem[];
  initialLastViewedActivityAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initialItems);
  // Compared against items[0] to derive the unread dot — see
  // getNotificationState's doc comment for why this stays a raw timestamp
  // instead of a pre-computed boolean: a poll tick and an optimistic "just
  // opened the bell" update both need to redo this comparison against
  // whatever `items` currently holds, not a snapshot taken elsewhere.
  const [lastViewedIso, setLastViewedIso] = useState(initialLastViewedActivityAt);

  const hasUnread =
    items.length > 0 &&
    (lastViewedIso === null || items[0].createdAtISO > lastViewedIso);

  usePolling(() => {
    void getNotificationState().then((state) => {
      setItems(state.items);
      // Only adopt the server's lastViewedActivityAt if it's newer than what
      // we already know. Opening the bell sets it optimistically below,
      // ahead of markActivityViewed()'s write landing — without this guard,
      // a poll tick that lands in that gap would read the old DB value and
      // undo the optimistic clear, flashing the dot back on.
      setLastViewedIso((current) =>
        current === null ||
        (state.lastViewedActivityAt !== null &&
          state.lastViewedActivityAt > current)
          ? state.lastViewedActivityAt
          : current,
      );
    });
  }, POLL_INTERVAL_MS);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && hasUnread) {
      // Optimistic: clears the dot immediately rather than waiting on the
      // persist below, and — since it's derived from real item timestamps,
      // not a boolean flag — stays correct if a newer activity arrives on a
      // later poll tick (hasUnread recomputes true again, as it should).
      setLastViewedIso(new Date().toISOString());
      void markActivityViewed();
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        aria-label={hasUnread ? "Notifications (unread)" : "Notifications"}
        className="relative flex size-9 cursor-pointer items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-primary dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        <Bell className="size-5" aria-hidden />
        {hasUnread && (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 size-2 rounded-full bg-status-rejected ring-2 ring-white dark:ring-neutral-900"
          />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 gap-0 p-0">
        <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <p className="text-sm font-semibold text-foreground">
            Recent activity
          </p>
        </div>

        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm italic text-neutral-400">
            No recent activity.
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800/60">
            {items.map((item) => (
              <li key={item.id} className="px-4 py-2.5">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{item.actorName}</span>{" "}
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {describeActivity(item.actionType)}
                  </span>
                </p>
                <p className="text-xs text-neutral-400">
                  {timeAgo(item.createdAtISO)}
                </p>
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/activity-log"
          onClick={() => setOpen(false)}
          className="block border-t border-neutral-200 px-4 py-2.5 text-center text-sm font-semibold text-primary transition-colors hover:bg-primary/5 dark:border-neutral-800"
        >
          View all
        </Link>
      </PopoverContent>
    </Popover>
  );
}

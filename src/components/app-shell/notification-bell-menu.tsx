"use client";

import { useState, useTransition } from "react";
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
import { markActivityViewed } from "./notification-actions";

// Client half of the notification bell: the Popover trigger + recent-activity
// preview. Permission gating and data fetching live in the server-side
// <NotificationBell> that renders this.
export function NotificationBellMenu({
  items,
  hasUnread,
}: {
  items: ActivityItem[];
  /** Server-computed: is there activity newer than this user last saw? */
  hasUnread: boolean;
}) {
  // Controlled so "View all" can explicitly close the popover as it navigates —
  // otherwise it stays open behind the newly-loaded activity-log page.
  const [open, setOpen] = useState(false);
  // Locally suppress the dot the moment the feed is opened, so it clears
  // instantly rather than waiting for the next server render to catch up.
  const [seen, setSeen] = useState(false);
  const [, startTransition] = useTransition();

  const showDot = hasUnread && !seen;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Opening the feed marks it seen. Fire-and-forget the persist; the dot is
    // hidden optimistically regardless of how the write goes.
    if (next && showDot) {
      setSeen(true);
      startTransition(() => {
        void markActivityViewed();
      });
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        aria-label={showDot ? "Notifications (unread)" : "Notifications"}
        className="relative flex size-9 cursor-pointer items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-primary dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        <Bell className="size-5" aria-hidden />
        {showDot && (
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

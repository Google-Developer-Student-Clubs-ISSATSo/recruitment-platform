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

// Client half of the notification bell: the Popover trigger + recent-activity
// preview. Permission gating and data fetching live in the server-side
// <NotificationBell> that renders this.
export function NotificationBellMenu({ items }: { items: ActivityItem[] }) {
  // Controlled so "View all" can explicitly close the popover as it navigates —
  // otherwise it stays open behind the newly-loaded activity-log page.
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={(next) => setOpen(next)}>
      <PopoverTrigger
        aria-label="Notifications"
        className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-primary dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        <Bell className="size-5" aria-hidden />
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

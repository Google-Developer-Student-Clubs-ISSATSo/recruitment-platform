"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import type { ActivityItem } from "@/lib/activity-descriptions";

export type NotificationState = {
  items: ActivityItem[];
  /**
   * ISO timestamp, or null if never viewed. Deliberately raw rather than a
   * pre-computed `hasUnread` boolean: the client derives unread by comparing
   * this against `items[0]`, the same way each poll tick and an optimistic
   * "just opened the bell" update both need to — a boolean snapshot would go
   * stale the moment either side of that comparison changes.
   */
  lastViewedActivityAt: string | null;
};

type EntryRow = {
  id: string;
  actionType: string;
  createdAt: Date;
  actor: { name: string | null } | null;
};

/**
 * The bell's data fetch, shared by the initial server render
 * (<NotificationBell>) and the client-side poll that keeps it live. Re-checks
 * VIEW_ACTIVITY_LOG itself — this is a Server Action, reachable directly, not
 * just through a component that happens to be permission-gated — so a caller
 * without the permission gets nothing rather than the feed.
 *
 * Same query the original server component ran — only the unread boolean it
 * used to compute inline now lives on the client, see `NotificationState`.
 */
export async function getNotificationState(): Promise<NotificationState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || !(await hasPermission(userId, PermissionKey.VIEW_ACTIVITY_LOG))) {
    return { items: [], lastViewedActivityAt: null };
  }

  const [entries, viewer] = await Promise.all([
    prisma.activityLogEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { actor: { select: { name: true } } },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { lastViewedActivityAt: true },
    }),
  ]);

  const items: ActivityItem[] = entries.map((e: EntryRow) => ({
    id: e.id,
    actorName: e.actor?.name ?? "Someone",
    actionType: e.actionType,
    createdAtISO: e.createdAt.toISOString(),
  }));

  return {
    items,
    lastViewedActivityAt: viewer?.lastViewedActivityAt?.toISOString() ?? null,
  };
}

/**
 * Mark the notification feed as seen for the current user — stamps
 * lastViewedActivityAt to now, which is what clears the bell's unread dot. Called
 * when the user opens the notification popover. Best-effort and silent: a failure
 * here should never surface as an error in the top bar, it just means the dot
 * lingers until the next open.
 */
export async function markActivityViewed(): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;

  await prisma.user.update({
    where: { id: userId },
    data: { lastViewedActivityAt: new Date() },
  });
}

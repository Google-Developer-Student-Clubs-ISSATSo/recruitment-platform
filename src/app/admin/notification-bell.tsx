import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import type { ActivityItem } from "@/lib/activity-descriptions";

import { NotificationBellMenu } from "./notification-bell-menu";

type EntryRow = {
  id: string;
  actionType: string;
  createdAt: Date;
  actor: { name: string | null } | null;
};

// Server-side gate + data for the top-bar notification bell. Renders nothing
// unless the current user holds VIEW_ACTIVITY_LOG, so the control is entirely
// hidden for everyone else (consistent with the rest of the permission-gated UI).
export async function NotificationBell() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  if (!(await hasPermission(userId, PermissionKey.VIEW_ACTIVITY_LOG))) {
    return null;
  }

  const entries = await prisma.activityLogEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { actor: { select: { name: true } } },
  });

  const items: ActivityItem[] = entries.map((e: EntryRow) => ({
    id: e.id,
    actorName: e.actor?.name ?? "Someone",
    actionType: e.actionType,
    createdAtISO: e.createdAt.toISOString(),
  }));

  return <NotificationBellMenu items={items} />;
}

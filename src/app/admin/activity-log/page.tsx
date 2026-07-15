import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import {
  formatDetails,
  SECURITY_ACTION_TYPES,
  type ActivityLogRow,
  type ActivitySummary,
} from "@/lib/activity-descriptions";

import { ActivityLogList } from "./activity-log-list";

type EntryRow = {
  id: string;
  actionType: string;
  targetType: string | null;
  details: unknown;
  createdAt: Date;
  actor: { name: string | null } | null;
};

// The /admin layout guards MANAGE_ACCOUNTS; this page adds the finer
// VIEW_ACTIVITY_LOG check so the log itself stays separately gated. The shell
// is provided by the layout.
export default async function ActivityLogPage() {
  await requirePermission(PermissionKey.VIEW_ACTIVITY_LOG);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [entries, total, actionsToday, securityEvents, mostActiveGroup] =
    await Promise.all([
      prisma.activityLogEntry.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { actor: { select: { name: true } } },
      }),
      prisma.activityLogEntry.count(),
      prisma.activityLogEntry.count({
        where: { createdAt: { gte: startOfToday } },
      }),
      prisma.activityLogEntry.count({
        where: { actionType: { in: SECURITY_ACTION_TYPES } },
      }),
      prisma.activityLogEntry.groupBy({
        by: ["actorId"],
        _count: { actorId: true },
        orderBy: { _count: { actorId: "desc" } },
        take: 1,
      }),
    ]);

  const rows: ActivityLogRow[] = entries.map((e: EntryRow) => ({
    id: e.id,
    actorName: e.actor?.name ?? "Someone",
    actionType: e.actionType,
    createdAtISO: e.createdAt.toISOString(),
    target: e.targetType ?? "—",
    details: formatDetails(e.details),
  }));

  let mostActiveUser = "—";
  const topActorId = mostActiveGroup[0]?.actorId;
  if (topActorId) {
    const topActor = await prisma.user.findUnique({
      where: { id: topActorId },
      select: { name: true },
    });
    mostActiveUser = topActor?.name ?? "—";
  }

  const summary: ActivitySummary = {
    actionsToday,
    securityEvents,
    mostActiveUser,
  };

  return (
    <ActivityLogList rows={rows} total={total} summary={summary} />
  );
}

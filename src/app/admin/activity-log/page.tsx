import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import type { ActivityItem } from "@/lib/activity-descriptions";

import { AdminShell } from "../admin-shell";
import { ROLE_TEMPLATE_LABELS } from "../permissions/permission-config";
import { ActivityLogList } from "./activity-log-list";

type EntryRow = {
  id: string;
  actionType: string;
  createdAt: Date;
  actor: { name: string | null } | null;
};

export default async function ActivityLogPage() {
  const actorId = await requirePermission(PermissionKey.VIEW_ACTIVITY_LOG);

  const [me, entries] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actorId },
      select: {
        name: true,
        committee: true,
        permissions: { select: { permission: true } },
        roleTemplate: { select: { name: true } },
      },
    }),
    prisma.activityLogEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const items: ActivityItem[] = entries.map((e: EntryRow) => ({
    id: e.id,
    actorName: e.actor?.name ?? "Someone",
    actionType: e.actionType,
    createdAtISO: e.createdAt.toISOString(),
  }));

  const currentUserName = me?.name ?? "Admin";
  const currentUserSubtitle = me?.roleTemplate
    ? `${ROLE_TEMPLATE_LABELS[me.roleTemplate.name]} · ${me.committee}`
    : "Administrator";
  const canManageAccounts =
    me?.permissions.some((p) => p.permission === PermissionKey.MANAGE_ACCOUNTS) ??
    false;

  return (
    <AdminShell
      userName={currentUserName}
      userSubtitle={currentUserSubtitle}
      canManageAccounts={canManageAccounts}
    >
      <ActivityLogList items={items} />
    </AdminShell>
  );
}

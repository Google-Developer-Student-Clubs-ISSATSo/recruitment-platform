import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { PermissionKey, InviteStatus } from "@/generated/prisma/enums";

import { AdminShell } from "../admin-shell";
import { TransferForm, type PendingInvite } from "./transfer-form";

type InviteRow = {
  id: string;
  invitedEmail: string;
  createdAt: Date;
  initiator: { name: string | null } | null;
};

export default async function TransferAdminPage() {
  const actorId = await requirePermission(PermissionKey.MANAGE_ACCOUNTS);

  const [me, invites] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true, email: true, committee: true },
    }),
    prisma.adminTransferInvite.findMany({
      where: { status: InviteStatus.PENDING },
      orderBy: { createdAt: "desc" },
      include: { initiator: { select: { name: true } } },
    }),
  ]);

  const pending: PendingInvite[] = invites.map((i: InviteRow) => ({
    id: i.id,
    invitedEmail: i.invitedEmail,
    createdAtISO: i.createdAt.toISOString(),
    initiatorName: i.initiator?.name ?? "Admin",
  }));

  const currentUserName = me?.name ?? "Admin";
  const currentUserSubtitle = me ? `TM Lead · ${me.committee}` : "Administrator";

  return (
    <AdminShell
      userName={currentUserName}
      userSubtitle={currentUserSubtitle}
      canManageAccounts
    >
      <TransferForm pending={pending} />
    </AdminShell>
  );
}

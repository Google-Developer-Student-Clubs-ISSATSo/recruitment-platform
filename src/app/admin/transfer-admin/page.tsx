import { prisma } from "@/lib/prisma";
import { InviteStatus } from "@/generated/prisma/enums";

import { TransferForm, type PendingInvite } from "./transfer-form";

type InviteRow = {
  id: string;
  invitedEmail: string;
  createdAt: Date;
  initiator: { name: string | null } | null;
};

// Guarded by the /admin layout (MANAGE_ACCOUNTS); the shell is provided there.
export default async function TransferAdminPage() {
  const invites = await prisma.adminTransferInvite.findMany({
    where: { status: InviteStatus.PENDING },
    orderBy: { createdAt: "desc" },
    include: { initiator: { select: { name: true } } },
  });

  const pending: PendingInvite[] = invites.map((i: InviteRow) => ({
    id: i.id,
    invitedEmail: i.invitedEmail,
    createdAtISO: i.createdAt.toISOString(),
    initiatorName: i.initiator?.name ?? "Admin",
  }));

  return <TransferForm pending={pending} />;
}

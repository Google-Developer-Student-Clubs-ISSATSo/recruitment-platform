"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { PermissionKey, InviteStatus } from "@/generated/prisma/enums";

const ADMIN = PermissionKey.MANAGE_ACCOUNTS;
const PATH = "/admin/transfer-admin";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TransferInviteState = {
  status: "idle" | "success" | "error";
  message?: string;
};

// Initiate an admin-role transfer to another registered member. Creates a
// pending AdminTransferInvite with a unique token. (Email delivery and the
// recipient-side accept flow are intentionally out of scope here — this
// records and tracks the pending invite and logs the action.)
export async function createTransferInvite(
  _prev: TransferInviteState,
  formData: FormData,
): Promise<TransferInviteState> {
  const actorId = await requirePermission(ADMIN);

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_RE.test(email))
    return { status: "error", message: "Enter a valid email address." };

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { email: true },
  });
  if (actor && actor.email.toLowerCase() === email)
    return { status: "error", message: "You cannot transfer the role to yourself." };

  const recipient = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!recipient)
    return {
      status: "error",
      message: "That email isn't a registered member. Transfers can only go to existing members.",
    };

  const duplicate = await prisma.adminTransferInvite.findFirst({
    where: { invitedEmail: email, status: InviteStatus.PENDING },
    select: { id: true },
  });
  if (duplicate)
    return {
      status: "error",
      message: "There is already a pending transfer invite for that member.",
    };

  const invite = await prisma.adminTransferInvite.create({
    data: {
      invitedEmail: email,
      token: randomBytes(32).toString("hex"),
      initiatedBy: actorId,
    },
  });

  await logActivity({
    actorId,
    actionType: "ADMIN_TRANSFER_INITIATED",
    targetType: "AdminTransferInvite",
    targetId: invite.id,
    details: { invitedEmail: email },
  });

  revalidatePath(PATH);
  return { status: "success", message: `Transfer invite created for ${email}.` };
}

// Cancel a pending transfer invite.
export async function cancelTransferInvite(inviteId: string): Promise<void> {
  const actorId = await requirePermission(ADMIN);

  const invite = await prisma.adminTransferInvite.findUnique({
    where: { id: inviteId },
    select: { id: true, status: true, invitedEmail: true },
  });
  if (!invite || invite.status !== InviteStatus.PENDING) return;

  await prisma.adminTransferInvite.update({
    where: { id: inviteId },
    data: { status: InviteStatus.CANCELLED, respondedAt: new Date() },
  });

  await logActivity({
    actorId,
    actionType: "ADMIN_TRANSFER_CANCELLED",
    targetType: "AdminTransferInvite",
    targetId: invite.id,
    details: { invitedEmail: invite.invitedEmail },
  });

  revalidatePath(PATH);
}

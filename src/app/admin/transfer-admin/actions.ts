"use server";

import { createElement } from "react";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { sendTemplatedEmail } from "@/lib/send-email";
import { AdminTransferInviteEmail } from "@/emails/AdminTransferInviteEmail";
import { buildAcceptUrl, isInviteExpired } from "./invite-link";
import {
  Committee,
  PermissionKey,
  InviteStatus,
  RoleTemplateName,
} from "@/generated/prisma/enums";

const ADMIN = PermissionKey.MANAGE_ACCOUNTS;
const PATH = "/admin/transfer-admin";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fixed subject, supplied by the caller like every other template's. */
const TRANSFER_SUBJECT = "You have been invited to become the GDGC ISSATSo Administrator";

export type TransferInviteState = {
  status: "idle" | "success" | "error";
  message?: string;
};

/**
 * Initiate an admin-role transfer to another TM committee member: validate the
 * recipient, create a pending AdminTransferInvite with a unique token, and mail
 * them the accept link.
 *
 * Eligibility is enforced HERE, on the server, not in the form: a server action
 * is reachable by POST regardless of what the UI renders, so the committee rule
 * would be trivially bypassable as a client-side check. The recipient must be an
 * existing User whose committee is TM — the Administrator runs Talent
 * Management, so the role cannot leave that committee.
 *
 * If the email fails to send, the invite row is removed again: an invite nobody
 * received is not a real invite, and leaving it behind would trip the duplicate
 * check and block a retry. The failed attempt is still recorded in the activity
 * log. (EmailLog is deliberately not used — it is applicant/campaign-scoped by
 * schema and has no shape for an internal, campaign-less message.)
 */
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
    select: { email: true, name: true },
  });
  if (actor && actor.email.toLowerCase() === email)
    return { status: "error", message: "You cannot transfer the role to yourself." };

  const recipient = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, committee: true },
  });

  // Both failure modes deliberately return the SAME message: whether an address
  // is registered here is not something the form should confirm.
  if (!recipient || recipient.committee !== Committee.TM) {
    return {
      status: "error",
      message: "This email must belong to an existing TM committee member.",
    };
  }

  const duplicate = await prisma.adminTransferInvite.findFirst({
    where: { invitedEmail: email, status: InviteStatus.PENDING },
    select: { id: true, createdAt: true },
  });
  if (duplicate && !isInviteExpired(duplicate.createdAt))
    return {
      status: "error",
      message: "There is already a pending transfer invite for that member.",
    };

  // An expired-but-still-PENDING row would block the retry above forever.
  if (duplicate) {
    await prisma.adminTransferInvite.update({
      where: { id: duplicate.id },
      data: { status: InviteStatus.CANCELLED, respondedAt: new Date() },
    });
  }

  const invite = await prisma.adminTransferInvite.create({
    data: {
      invitedEmail: email,
      token: randomBytes(32).toString("hex"),
      initiatedBy: actorId,
    },
  });

  const result = await sendTemplatedEmail({
    to: recipient.email,
    subject: TRANSFER_SUBJECT,
    component: createElement(AdminTransferInviteEmail, {
      recipientName: recipient.name ?? recipient.email,
      initiatorName: actor?.name ?? "The current Administrator",
      acceptUrl: buildAcceptUrl(invite.token),
    }),
  });

  if (!result.ok) {
    await prisma.adminTransferInvite.delete({ where: { id: invite.id } });

    await logActivity({
      actorId,
      actionType: "ADMIN_TRANSFER_INVITE_FAILED",
      targetType: "AdminTransferInvite",
      details: { invitedEmail: email, error: result.error },
    });

    revalidatePath(PATH);
    return {
      status: "error",
      message: `The invite email could not be sent (${result.error}). No invite was created — please try again.`,
    };
  }

  await logActivity({
    actorId,
    actionType: "ADMIN_TRANSFER_INITIATED",
    targetType: "AdminTransferInvite",
    targetId: invite.id,
    details: { invitedEmail: email, emailSent: true },
  });

  revalidatePath(PATH);
  return {
    status: "success",
    message: `Transfer invite sent to ${email}.`,
  };
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

export type AcceptTransferResult =
  | { ok: true; previousAdminName: string }
  | { ok: false; error: string };

/**
 * Accept an admin-role transfer and move the Administrator role.
 *
 * Authorisation here is the token PLUS the signed-in identity: holding the link
 * is not enough, the session's email must be the invited address. Otherwise
 * anyone who saw the URL (a forwarded mail, a shared screen) could claim the
 * role. There is no permission check — by definition the recipient does not yet
 * hold MANAGE_ACCOUNTS.
 *
 * Because exactly one Administrator exists at a time, this both promotes the
 * recipient to TM_LEAD and demotes every current TM_LEAD to TM_REVIEWER, giving
 * each their new template's permissions outright. Every other pending invite is
 * cancelled in the same breath — they were offers to hand over a role the
 * initiator no longer holds.
 */
export async function acceptTransferInvite(
  token: string,
): Promise<AcceptTransferResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You need to be signed in to accept a transfer." };

  const invite = await prisma.adminTransferInvite.findUnique({
    where: { token },
    select: { id: true, invitedEmail: true, status: true, createdAt: true },
  });
  if (!invite) return { ok: false, error: "This transfer link is not valid." };
  if (invite.status !== InviteStatus.PENDING)
    return { ok: false, error: "This transfer invite has already been used or cancelled." };
  if (isInviteExpired(invite.createdAt))
    return { ok: false, error: "This transfer invite has expired. Ask the Administrator to send a new one." };

  const recipient = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, committee: true },
  });
  if (!recipient) return { ok: false, error: "This transfer link is not valid." };

  if (recipient.email.toLowerCase() !== invite.invitedEmail.toLowerCase())
    return {
      ok: false,
      error: "This invite was sent to a different member. Sign in with the invited email address to accept it.",
    };

  // Re-checked at accept time, not just at send time: a member can be moved to
  // another committee while an invite sits pending.
  if (recipient.committee !== Committee.TM)
    return { ok: false, error: "Only a TM committee member can hold the Administrator role." };

  const [leadTemplate, reviewerTemplate] = await Promise.all([
    prisma.roleTemplate.findUnique({
      where: { name: RoleTemplateName.TM_LEAD },
      select: { id: true, permissions: { select: { permission: true } } },
    }),
    prisma.roleTemplate.findUnique({
      where: { name: RoleTemplateName.TM_REVIEWER },
      select: { id: true, permissions: { select: { permission: true } } },
    }),
  ]);
  if (!leadTemplate || !reviewerTemplate)
    return { ok: false, error: "Role templates are missing — contact the platform owner." };

  const outgoing = await prisma.user.findMany({
    where: { roleTemplate: { name: RoleTemplateName.TM_LEAD }, id: { not: recipient.id } },
    select: { id: true, name: true },
  });
  const outgoingIds = outgoing.map((u) => u.id);

  // Reads are done; every write below lands in one transaction so a half-moved
  // role (two admins, or none) is never observable. Array form, matching the
  // rest of the app.
  await prisma.$transaction([
    // Demote the outgoing Administrator(s) to TM Reviewer.
    prisma.userPermission.deleteMany({ where: { userId: { in: outgoingIds } } }),
    prisma.userPermission.createMany({
      data: outgoingIds.flatMap((id) =>
        reviewerTemplate.permissions.map((p) => ({
          userId: id,
          permission: p.permission,
          grantedBy: recipient.id,
        })),
      ),
      skipDuplicates: true,
    }),
    prisma.user.updateMany({
      where: { id: { in: outgoingIds } },
      data: { roleTemplateId: reviewerTemplate.id },
    }),

    // Promote the recipient to Administrator.
    prisma.userPermission.deleteMany({ where: { userId: recipient.id } }),
    prisma.userPermission.createMany({
      data: leadTemplate.permissions.map((p) => ({
        userId: recipient.id,
        permission: p.permission,
        grantedBy: recipient.id,
      })),
      skipDuplicates: true,
    }),
    prisma.user.update({
      where: { id: recipient.id },
      data: { roleTemplateId: leadTemplate.id },
    }),

    prisma.adminTransferInvite.update({
      where: { id: invite.id },
      data: { status: InviteStatus.ACCEPTED, respondedAt: new Date() },
    }),
    // Any other offer to hand over this role is now meaningless.
    prisma.adminTransferInvite.updateMany({
      where: { status: InviteStatus.PENDING, id: { not: invite.id } },
      data: { status: InviteStatus.CANCELLED, respondedAt: new Date() },
    }),
  ]);

  await logActivity({
    actorId: recipient.id,
    actionType: "ADMIN_TRANSFER_ACCEPTED",
    targetType: "AdminTransferInvite",
    targetId: invite.id,
    details: {
      newAdminEmail: recipient.email,
      demotedUserIds: outgoingIds,
      demotedCount: outgoingIds.length,
    },
  });

  revalidatePath(PATH);
  revalidatePath("/admin/permissions");
  return { ok: true, previousAdminName: outgoing[0]?.name ?? "The previous Administrator" };
}

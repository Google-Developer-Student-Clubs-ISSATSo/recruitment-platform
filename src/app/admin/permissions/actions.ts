"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { sendMail } from "@/lib/email";
import {
  Committee,
  InviteStatus,
  PermissionKey,
  RoleTemplateName,
} from "@/generated/prisma/enums";
import { ROLE_TEMPLATE_LABELS } from "./permission-config";

const ADMIN = PermissionKey.MANAGE_ACCOUNTS;
const PATH = "/admin/permissions";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateInviteState = {
  /** "duplicate" → a PENDING invite already exists (offer resend/cancel). */
  status: "idle" | "success" | "error" | "duplicate";
  message?: string;
  /** Set on "duplicate" so the form can offer Resend/Cancel for it inline. */
  existingInviteId?: string;
};

/** Absolute URL the invitee follows to accept, e.g. https://host/invite/accept?token=… */
async function acceptUrl(token: string): Promise<string> {
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}/invite/accept?token=${token}`;
}

function inviteEmail(url: string, name: string, roleLabel: string) {
  const text = [
    `Hi ${name},`,
    "",
    "You've been invited to join the GDGC Recruitment Platform as a",
    `${roleLabel}. Accept your invitation here:`,
    "",
    url,
    "",
    "After accepting, you'll sign in with your email via a magic link.",
  ].join("\n");

  const html = `
  <div style="background:#f6f7f9;padding:32px 0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e6e8eb;">
          <tr><td style="font-size:18px;font-weight:600;color:#1a1a1a;padding-bottom:8px;">
            You've been invited to GDGC Recruitment Platform
          </td></tr>
          <tr><td style="font-size:14px;color:#5f6368;padding-bottom:24px;">
            Hi ${name}, you've been invited to join as a <strong>${roleLabel}</strong>.
          </td></tr>
          <tr><td align="center" style="padding-bottom:24px;">
            <a href="${url}"
               style="background:#4285f4;color:#ffffff;text-decoration:none;font-size:15px;
                      font-weight:600;padding:12px 28px;border-radius:8px;display:inline-block;">
              Accept Invite
            </a>
          </td></tr>
          <tr><td style="font-size:12px;color:#80868b;line-height:1.5;">
            After accepting, you'll sign in with your email via a magic link.
            If you didn't expect this invite, you can safely ignore it.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;

  return { text, html };
}

// Invite a brand-new member. Creates a PENDING UserInvite (NOT a User) and
// emails an accept link. The real User is only created when the link is used.
export async function createInvite(
  _prev: CreateInviteState,
  formData: FormData,
): Promise<CreateInviteState> {
  const actorId = await requirePermission(ADMIN);

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const roleTemplate = String(
    formData.get("roleTemplate") ?? "",
  ) as RoleTemplateName;
  const committee = String(formData.get("committee") ?? "") as Committee;

  if (!EMAIL_RE.test(email))
    return { status: "error", message: "Enter a valid email address." };
  if (!name) return { status: "error", message: "Enter a name." };
  if (!(roleTemplate in ROLE_TEMPLATE_LABELS))
    return { status: "error", message: "Choose a role template." };
  if (!(committee in Committee))
    return { status: "error", message: "Choose a committee." };

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } }))
    return {
      status: "error",
      message: "Someone with that email is already an active member.",
    };

  // Don't create a duplicate — surface the existing pending invite instead.
  const existing = await prisma.userInvite.findFirst({
    where: { email, status: InviteStatus.PENDING },
    select: { id: true },
  });
  if (existing)
    return {
      status: "duplicate",
      existingInviteId: existing.id,
      message: `A pending invite for ${email} already exists.`,
    };

  const template = await prisma.roleTemplate.findUnique({
    where: { name: roleTemplate },
    select: { id: true },
  });
  if (!template)
    return { status: "error", message: "Role template not found." };

  const invite = await prisma.userInvite.create({
    data: {
      email,
      name,
      committee,
      roleTemplateId: template.id,
      token: randomBytes(32).toString("hex"),
      invitedBy: actorId,
    },
  });

  await logActivity({
    actorId,
    actionType: "USER_INVITE_SENT",
    targetType: "UserInvite",
    targetId: invite.id,
    details: { email, committee, roleTemplate },
  });

  try {
    const { text, html } = inviteEmail(
      await acceptUrl(invite.token),
      name,
      ROLE_TEMPLATE_LABELS[roleTemplate],
    );
    await sendMail({
      to: email,
      subject: "You've been invited to GDGC Recruitment Platform",
      text,
      html,
    });
  } catch {
    revalidatePath(PATH);
    return {
      status: "error",
      message:
        "Invite saved, but the email couldn't be sent. Use Resend from the pending list.",
    };
  }

  revalidatePath(PATH);
  return { status: "success", message: `Invitation sent to ${email}.` };
}

// Re-send the invite email for a still-pending invite (same token).
export async function resendInvite(inviteId: string): Promise<void> {
  const actorId = await requirePermission(ADMIN);

  const invite = await prisma.userInvite.findUnique({
    where: { id: inviteId },
    include: { roleTemplate: { select: { name: true } } },
  });
  if (!invite || invite.status !== InviteStatus.PENDING) return;

  const { text, html } = inviteEmail(
    await acceptUrl(invite.token),
    invite.name,
    ROLE_TEMPLATE_LABELS[invite.roleTemplate.name],
  );
  await sendMail({
    to: invite.email,
    subject: "You've been invited to GDGC Recruitment Platform",
    text,
    html,
  });

  await prisma.userInvite.update({
    where: { id: invite.id },
    data: { createdAt: new Date() },
  });

  await logActivity({
    actorId,
    actionType: "USER_INVITE_SENT",
    targetType: "UserInvite",
    targetId: invite.id,
    details: { email: invite.email, resend: true },
  });

  revalidatePath(PATH);
}

// Cancel a pending invite so the link can no longer be accepted.
export async function cancelInvite(inviteId: string): Promise<void> {
  const actorId = await requirePermission(ADMIN);

  const invite = await prisma.userInvite.findUnique({
    where: { id: inviteId },
    select: { id: true, status: true, email: true },
  });
  if (!invite || invite.status !== InviteStatus.PENDING) return;

  await prisma.userInvite.update({
    where: { id: invite.id },
    data: { status: InviteStatus.CANCELLED, respondedAt: new Date() },
  });

  await logActivity({
    actorId,
    actionType: "USER_INVITE_CANCELLED",
    targetType: "UserInvite",
    targetId: invite.id,
    details: { email: invite.email },
  });

  revalidatePath(PATH);
}

export async function togglePermission(
  userId: string,
  permission: PermissionKey,
  grant: boolean,
): Promise<void> {
  const actorId = await requirePermission(ADMIN);

  if (grant) {
    const existing = await prisma.userPermission.findFirst({
      where: { userId, permission },
      select: { id: true },
    });
    if (!existing) {
      await prisma.userPermission.create({
        data: { userId, permission, grantedBy: actorId },
      });
    }
  } else {
    await prisma.userPermission.deleteMany({
      where: { userId, permission },
    });
  }

  await logActivity({
    actorId,
    actionType: grant ? "PERMISSION_GRANTED" : "PERMISSION_REVOKED",
    targetType: "User",
    targetId: userId,
    details: { permission },
  });

  revalidatePath(PATH);
}

// Reset a user's permissions to the defaults of the template they were
// originally assigned. The user's stored roleTemplateId is the source of
// truth — we do not trust a template passed from the client or infer one.
export async function resetToTemplate(userId: string): Promise<void> {
  const actorId = await requirePermission(ADMIN);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      roleTemplate: {
        select: {
          name: true,
          permissions: { select: { permission: true } },
        },
      },
    },
  });
  const template = user?.roleTemplate;
  if (!template) return;

  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId } }),
    prisma.userPermission.createMany({
      data: template.permissions.map((p: { permission: PermissionKey }) => ({
        userId,
        permission: p.permission,
        grantedBy: actorId,
      })),
    }),
  ]);

  await logActivity({
    actorId,
    actionType: "PERMISSIONS_RESET",
    targetType: "User",
    targetId: userId,
    details: { roleTemplate: template.name },
  });

  revalidatePath(PATH);
}

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { InviteStatus, PermissionKey } from "@/generated/prisma/enums";

export type AcceptResult =
  | { ok: true }
  | {
      ok: false;
      reason: "NOT_FOUND" | "ACCEPTED" | "CANCELLED" | "EXPIRED" | "ERROR";
    };

// Accept a UserInvite by token: create the real User + copy the template's
// permissions, then mark the invite ACCEPTED. Only a PENDING invite is valid;
// anything else (missing, already used, cancelled, expired) is reported so the
// page can show a clear message.
export async function acceptInvite(token: string): Promise<AcceptResult> {
  if (!token) return { ok: false, reason: "NOT_FOUND" };

  const invite = await prisma.userInvite.findUnique({
    where: { token },
    include: {
      roleTemplate: {
        select: { permissions: { select: { permission: true } } },
      },
    },
  });

  if (!invite) return { ok: false, reason: "NOT_FOUND" };
  if (invite.status !== InviteStatus.PENDING) {
    return { ok: false, reason: invite.status };
  }

  try {
    const user = await prisma.user.create({
      data: {
        name: invite.name,
        email: invite.email,
        committee: invite.committee,
        roleTemplateId: invite.roleTemplateId,
      },
    });

    if (invite.roleTemplate.permissions.length > 0) {
      await prisma.userPermission.createMany({
        data: invite.roleTemplate.permissions.map(
          (p: { permission: PermissionKey }) => ({
            userId: user.id,
            permission: p.permission,
            grantedBy: invite.invitedBy,
          }),
        ),
      });
    }

    await prisma.userInvite.update({
      where: { id: invite.id },
      data: { status: InviteStatus.ACCEPTED, respondedAt: new Date() },
    });

    await logActivity({
      actorId: user.id,
      actionType: "USER_INVITE_ACCEPTED",
      targetType: "User",
      targetId: user.id,
    });

    return { ok: true };
  } catch {
    // Most likely the email became an active user already (unique constraint).
    return { ok: false, reason: "ERROR" };
  }
}

"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import {
  Committee,
  PermissionKey,
  RoleTemplateName,
} from "@/generated/prisma/enums";
import { ROLE_TEMPLATE_LABELS } from "./permission-config";

const ADMIN = PermissionKey.MANAGE_ACCOUNTS;
const PATH = "/admin/permissions";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The TM Lead's permissions are fixed by definition — the full set — and their
// account is not removable from this screen. Any mutation targeting a TM_LEAD
// user is rejected server-side, not merely hidden in the UI. Throwing here
// surfaces as a clear error to a caller that reaches the action directly.
async function assertNotLead(userId: string): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { roleTemplate: { select: { name: true } } },
  });
  if (target?.roleTemplate?.name === RoleTemplateName.TM_LEAD) {
    throw new Error(
      "The TM Lead's permissions are fixed and cannot be modified.",
    );
  }
}

export type CreateUserState = {
  status: "idle" | "success" | "error";
  message?: string;
};

// Create a brand-new member directly: a real User row plus the UserPermission
// rows copied from the chosen role template, effective immediately. The user
// can sign in with their email straight away — there is no acceptance step.
export async function createUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
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
      message: "Someone with that email is already a member.",
    };

  const template = await prisma.roleTemplate.findUnique({
    where: { name: roleTemplate },
    select: {
      id: true,
      permissions: { select: { permission: true } },
    },
  });
  if (!template)
    return { status: "error", message: "Role template not found." };

  const user = await prisma.user.create({
    data: {
      name,
      email,
      committee,
      roleTemplateId: template.id,
    },
  });

  if (template.permissions.length > 0) {
    await prisma.userPermission.createMany({
      data: template.permissions.map((p: { permission: PermissionKey }) => ({
        userId: user.id,
        permission: p.permission,
        grantedBy: actorId,
      })),
    });
  }

  await logActivity({
    actorId,
    actionType: "USER_CREATED",
    targetType: "User",
    targetId: user.id,
    details: { email, committee, roleTemplate },
  });

  revalidatePath(PATH);
  return { status: "success", message: `${name} was added as a member.` };
}

// Permanently remove a member. UserPermission, Session, and Account rows are
// removed automatically by their onDelete: Cascade relations; ActivityLogEntry
// (actor) and AdminTransferInvite (initiator) reference the user WITHOUT a
// cascade, so those are cleared in the same transaction or the delete would hit
// a foreign-key violation. The name/email are captured before deletion for the
// audit entry, since targetId won't resolve to anything afterwards.
export async function deleteUser(userId: string): Promise<void> {
  const actorId = await requirePermission(ADMIN);

  // An admin can never delete their own account from this screen — handing off
  // the admin role is what Transfer Admin Role is for.
  if (userId === actorId) return;

  // The TM Lead is not removable from here either.
  await assertNotLead(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!user) return;

  await prisma.$transaction([
    prisma.activityLogEntry.deleteMany({ where: { actorId: userId } }),
    prisma.adminTransferInvite.deleteMany({ where: { initiatedBy: userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  await logActivity({
    actorId,
    actionType: "USER_DELETED",
    targetType: "User",
    targetId: userId,
    details: { deletedEmail: user.email, deletedName: user.name },
  });

  revalidatePath(PATH);
}

export async function togglePermission(
  userId: string,
  permission: PermissionKey,
  grant: boolean,
): Promise<void> {
  const actorId = await requirePermission(ADMIN);
  await assertNotLead(userId);

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
  await assertNotLead(userId);

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

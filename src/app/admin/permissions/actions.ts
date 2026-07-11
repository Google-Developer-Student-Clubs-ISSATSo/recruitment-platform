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

export type CreateUserState = {
  status: "idle" | "success" | "error";
  message?: string;
};

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

  if (!EMAIL_RE.test(email))
    return { status: "error", message: "Enter a valid email address." };
  if (!name) return { status: "error", message: "Enter a name." };
  if (!(roleTemplate in ROLE_TEMPLATE_LABELS))
    return { status: "error", message: "Choose a role template." };

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } }))
    return {
      status: "error",
      message: "A user with that email already exists.",
    };

  const template = await prisma.roleTemplate.findUnique({
    where: { name: roleTemplate },
    include: { permissions: { select: { permission: true } } },
  });
  if (!template)
    return { status: "error", message: "Role template not found." };

  const user = await prisma.user.create({ data: { email, name } });

  if (template.permissions.length > 0) {
    // Template defaults are not committee-specific → committee = null.
    await prisma.userPermission.createMany({
      data: template.permissions.map((p: { permission: PermissionKey }) => ({
        userId: user.id,
        permission: p.permission,
        committee: null,
        grantedBy: actorId,
      })),
    });
  }

  await logActivity({
    actorId,
    actionType: "USER_CREATED",
    targetType: "User",
    targetId: user.id,
    details: { email, roleTemplate },
  });

  revalidatePath(PATH);
  return { status: "success", message: `Created ${name}.` };
}

export async function togglePermission(
  userId: string,
  permission: PermissionKey,
  committee: Committee | null,
  grant: boolean,
): Promise<void> {
  const actorId = await requirePermission(ADMIN);

  if (grant) {
    const existing = await prisma.userPermission.findFirst({
      where: { userId, permission, committee },
      select: { id: true },
    });
    if (!existing) {
      await prisma.userPermission.create({
        data: { userId, permission, committee, grantedBy: actorId },
      });
    }
  } else {
    await prisma.userPermission.deleteMany({
      where: { userId, permission, committee },
    });
  }

  await logActivity({
    actorId,
    actionType: grant ? "PERMISSION_GRANTED" : "PERMISSION_REVOKED",
    targetType: "User",
    targetId: userId,
    details: { permission, committee },
  });

  revalidatePath(PATH);
}

export async function resetToTemplate(
  userId: string,
  roleTemplate: RoleTemplateName,
): Promise<void> {
  const actorId = await requirePermission(ADMIN);

  const template = await prisma.roleTemplate.findUnique({
    where: { name: roleTemplate },
    include: { permissions: { select: { permission: true } } },
  });
  if (!template) return;

  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId } }),
    prisma.userPermission.createMany({
      data: template.permissions.map((p: { permission: PermissionKey }) => ({
        userId,
        permission: p.permission,
        committee: null,
        grantedBy: actorId,
      })),
    }),
  ]);

  await logActivity({
    actorId,
    actionType: "PERMISSIONS_RESET",
    targetType: "User",
    targetId: userId,
    details: { roleTemplate },
  });

  revalidatePath(PATH);
}

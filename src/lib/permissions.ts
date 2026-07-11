import { cache } from "react";
import { forbidden, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { UserPermission } from "@/generated/prisma/client";
import type { Committee, PermissionKey } from "@/generated/prisma/enums";

export const hasPermission = cache(async function hasPermission(
  userId: string,
  permission: PermissionKey,
  committee: Committee | null = null,
): Promise<boolean> {
  const match = await prisma.userPermission.findFirst({
    where: { userId, permission, committee },
    select: { id: true },
  });
  return match !== null;
});

export const getUserPermissions = cache(async function getUserPermissions(
  userId: string,
): Promise<UserPermission[]> {
  return prisma.userPermission.findMany({
    where: { userId },
    orderBy: [{ permission: "asc" }, { committee: "asc" }],
  });
});

export async function requirePermission(
  permission: PermissionKey,
  committee: Committee | null = null,
): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  if (!(await hasPermission(userId, permission, committee))) {
    forbidden();
  }

  return userId;
}

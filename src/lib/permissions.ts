import { cache } from "react";
import { forbidden, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { UserPermission } from "@/generated/prisma/client";
import type { PermissionKey } from "@/generated/prisma/enums";

export const hasPermission = cache(async function hasPermission(
  userId: string,
  permission: PermissionKey,
): Promise<boolean> {
  const match = await prisma.userPermission.findFirst({
    where: { userId, permission },
    select: { id: true },
  });
  return match !== null;
});

export const getUserPermissions = cache(async function getUserPermissions(
  userId: string,
): Promise<UserPermission[]> {
  return prisma.userPermission.findMany({
    where: { userId },
    orderBy: { permission: "asc" },
  });
});

export async function requirePermission(
  permission: PermissionKey,
  options?: {
    /**
     * Where to send a signed-in user who lacks the permission. When set, they
     * are redirected there instead of hitting the raw 403 `forbidden()` page —
     * used by the /admin guard to bounce non-admins to /dashboard with a clear
     * message rather than an error.
     */
    redirectTo?: string;
  },
): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  if (!(await hasPermission(userId, permission))) {
    if (options?.redirectTo) {
      redirect(options.redirectTo);
    }
    forbidden();
  }

  return userId;
}

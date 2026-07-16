import { cache } from "react";
import { redirect } from "next/navigation";

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

/** True if the user holds at least one of the given permissions. */
export async function hasAnyPermission(
  userId: string,
  permissions: readonly PermissionKey[],
): Promise<boolean> {
  const results = await Promise.all(
    permissions.map((permission) => hasPermission(userId, permission)),
  );
  return results.some(Boolean);
}

/**
 * Where a signed-in user who lacks a required permission is sent. Consistent
 * everywhere `requirePermission` is used — the /admin guard, the campaign
 * pages, and server actions — so there is one access-denied experience (a
 * friendly banner on the campaign list) rather than a raw 403 in some places
 * and a redirect in others. `/campaigns` reads `?denied=1` to show the banner.
 * Campaign-scoped pages may override this to keep the user inside the campaign.
 */
const ACCESS_DENIED_REDIRECT = "/campaigns?denied=1";

export async function requirePermission(
  permission: PermissionKey,
  options?: {
    /**
     * Override the destination for a signed-in user who lacks the permission.
     * Defaults to {@link ACCESS_DENIED_REDIRECT}; callers rarely need to change
     * it — the point is a single consistent no-access behavior.
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
    redirect(options?.redirectTo ?? ACCESS_DENIED_REDIRECT);
  }

  return userId;
}

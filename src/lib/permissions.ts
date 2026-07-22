import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { UserPermission } from "@/generated/prisma/client";
import type { PermissionKey } from "@/generated/prisma/enums";
// Value import (not just the type) — the interview-note helpers below compare
// against specific permission keys at runtime.
import { PermissionKey as PermissionKeyEnum } from "@/generated/prisma/enums";

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

/**
 * May this user write the interview note for this applicant?
 *
 * Two routes in:
 *   - MANAGE_ACCOUNTS — the TM Lead can always edit any note, panel or not.
 *   - EDIT_OWN_INTERVIEW_NOTES *and* actually sitting on this applicant's panel,
 *     i.e. holding one of its PanelSeats.
 *
 * The second half is the important one: the permission alone is not enough. It
 * is held by every interviewer in the club, so without the seat check anyone
 * could write into any candidate's note. "Own" in the permission name means the
 * interviews you are on, and the seat is what establishes that.
 */
export const canEditInterviewNote = cache(async function canEditInterviewNote(
  userId: string,
  applicantId: string,
): Promise<boolean> {
  if (await hasPermission(userId, PermissionKeyEnum.MANAGE_ACCOUNTS)) return true;

  if (!(await hasPermission(userId, PermissionKeyEnum.EDIT_OWN_INTERVIEW_NOTES))) {
    return false;
  }

  const seat = await prisma.panelSeat.findFirst({
    where: { claimedById: userId, panel: { applicantId } },
    select: { id: true },
  });
  return seat !== null;
});

/**
 * May this user read the interview note for this applicant?
 *
 * Anyone who can edit it, plus VIEW_COMMITTEE_DASHBOARD holders — Committee
 * Reps review interviews they did not personally sit on, but strictly
 * read-only; the page renders static text for them, and the save action still
 * checks {@link canEditInterviewNote}.
 */
export const canViewInterviewNote = cache(async function canViewInterviewNote(
  userId: string,
  applicantId: string,
): Promise<boolean> {
  if (await canEditInterviewNote(userId, applicantId)) return true;
  return hasPermission(userId, PermissionKeyEnum.VIEW_COMMITTEE_DASHBOARD);
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

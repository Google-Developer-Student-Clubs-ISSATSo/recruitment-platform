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
 * Is this applicant's interview note closed?
 *
 * A closed note is locked to MANAGE_ACCOUNTS only (see below). No row, or a row
 * with a null closedAt, means open. Request-cached like the permission checks.
 */
export const isInterviewNoteClosed = cache(async function isInterviewNoteClosed(
  applicantId: string,
): Promise<boolean> {
  const note = await prisma.interviewNote.findUnique({
    where: { applicantId },
    select: { closedAt: true },
  });
  return note?.closedAt != null;
});

/**
 * May this user write the interview note for this applicant?
 *
 * Routes in:
 *   - MANAGE_ACCOUNTS — the TM Lead can always edit any note, panel or not,
 *     open or closed. This is checked first, so nothing below can lock them out.
 *   - Otherwise, once the note is CLOSED nobody but MANAGE_ACCOUNTS may touch it
 *     — a panel member loses all access the moment it's closed, not just the
 *     inputs. Reopening (MANAGE_ACCOUNTS only) restores the access below.
 *   - On an open note: EDIT_OWN_INTERVIEW_NOTES *and* actually sitting on this
 *     applicant's panel (holding one of its PanelSeats).
 *
 * The seat check is the important half: EDIT_OWN_INTERVIEW_NOTES is held by
 * every interviewer, so without it anyone could write into any candidate's note.
 * "Own" means the interviews you are on, and the seat is what establishes that.
 */
export const canEditInterviewNote = cache(async function canEditInterviewNote(
  userId: string,
  applicantId: string,
): Promise<boolean> {
  if (await hasPermission(userId, PermissionKeyEnum.MANAGE_ACCOUNTS)) return true;

  // A closed note is off-limits to everyone except MANAGE_ACCOUNTS (handled above).
  if (await isInterviewNoteClosed(applicantId)) return false;

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
 * MANAGE_ACCOUNTS always. Otherwise a CLOSED note grants no read access at all —
 * panel members and Committee Reps alike are turned away, same as if they never
 * had permission. On an open note: anyone who can edit it, plus
 * VIEW_COMMITTEE_DASHBOARD holders (Committee Reps review interviews they did not
 * personally sit on, strictly read-only; the save action still checks
 * {@link canEditInterviewNote}).
 */
export const canViewInterviewNote = cache(async function canViewInterviewNote(
  userId: string,
  applicantId: string,
): Promise<boolean> {
  if (await hasPermission(userId, PermissionKeyEnum.MANAGE_ACCOUNTS)) return true;
  if (await isInterviewNoteClosed(applicantId)) return false;

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

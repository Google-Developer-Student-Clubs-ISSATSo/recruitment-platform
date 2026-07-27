import { cache } from "react";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { UserPermission } from "@/generated/prisma/client";
import type { PermissionKey } from "@/generated/prisma/enums";
// Value import (not just the type) — the interview-note helpers below compare
// against specific permission keys at runtime.
import { PermissionKey as PermissionKeyEnum } from "@/generated/prisma/enums";

export const getUserPermissions = cache(async function getUserPermissions(
  userId: string,
): Promise<UserPermission[]> {
  return prisma.userPermission.findMany({
    where: { userId },
    orderBy: { permission: "asc" },
  });
});

/**
 * Derived from the request-cached permission LIST rather than querying for the
 * one key. A single render asks about several different permissions — the page
 * guard, then each `<PermissionGate>`, then per-section checks — and a
 * per-key `findFirst` made every one of those its own round trip, since
 * `cache()` keys on the arguments and the permission differs each time.
 * Reading the user's whole (small) permission set once means the first check
 * costs one query and every later check in the same request is free.
 */
export async function hasPermission(
  userId: string,
  permission: PermissionKey,
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissions.some((p) => p.permission === permission);
}

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
/**
 * The note-access rules themselves, as a pure function of the four facts they
 * depend on. This is the single source of truth: the async helpers below gather
 * those facts from the database for ONE applicant, while a list view that has
 * already loaded `interviewNote.closedAt` and the panel's seats can call this
 * directly and decide for every row without another query (see the interviews
 * board). Keeping the rules here is what stops those two paths from drifting.
 */
export function evaluateNoteAccess({
  canManageAccounts,
  canEditOwnNotes,
  noteClosed,
  holdsSeat,
}: {
  canManageAccounts: boolean;
  canEditOwnNotes: boolean;
  noteClosed: boolean;
  holdsSeat: boolean;
}): { canEdit: boolean; canView: boolean } {
  // The TM Lead can always edit any note, panel or not, open or closed.
  if (canManageAccounts) return { canEdit: true, canView: true };
  // A closed note is off-limits to everyone else — no read access either.
  if (noteClosed) return { canEdit: false, canView: false };
  // On an open note: the permission AND a seat on this applicant's panel.
  const canEdit = canEditOwnNotes && holdsSeat;
  return { canEdit, canView: canEdit };
}

/** Does this user hold a seat on this applicant's interview panel? */
const holdsPanelSeat = cache(async function holdsPanelSeat(
  userId: string,
  applicantId: string,
): Promise<boolean> {
  const seat = await prisma.panelSeat.findFirst({
    where: { claimedById: userId, panel: { applicantId } },
    select: { id: true },
  });
  return seat !== null;
});

/** The four inputs for one applicant, gathered concurrently. */
const noteAccessFor = cache(async function noteAccessFor(
  userId: string,
  applicantId: string,
) {
  const [canManageAccounts, canEditOwnNotes, noteClosed, holdsSeat] =
    await Promise.all([
      hasPermission(userId, PermissionKeyEnum.MANAGE_ACCOUNTS),
      hasPermission(userId, PermissionKeyEnum.EDIT_OWN_INTERVIEW_NOTES),
      isInterviewNoteClosed(applicantId),
      holdsPanelSeat(userId, applicantId),
    ]);
  return evaluateNoteAccess({
    canManageAccounts,
    canEditOwnNotes,
    noteClosed,
    holdsSeat,
  });
});

export const canEditInterviewNote = cache(async function canEditInterviewNote(
  userId: string,
  applicantId: string,
): Promise<boolean> {
  return (await noteAccessFor(userId, applicantId)).canEdit;
});

/**
 * May this user read the interview note for this applicant?
 *
 * Exactly the panel and the TM Lead — no wider preview for anyone else.
 * MANAGE_ACCOUNTS (the TM Lead) always. Otherwise a CLOSED note grants no read
 * access at all: even a panel member is turned away, same as if they never had
 * permission. On an open note, read access is precisely "can edit it", i.e.
 * holding EDIT_OWN_INTERVIEW_NOTES *and* a seat on this applicant's panel.
 *
 * There is deliberately no permission-flag fallback here. The read-only
 * committee preview this used to grant (via the since-deleted
 * VIEW_COMMITTEE_DASHBOARD) was made obsolete by the close/reopen workflow, so
 * being off the panel now means no access at any point in the note's life.
 */
export const canViewInterviewNote = cache(async function canViewInterviewNote(
  userId: string,
  applicantId: string,
): Promise<boolean> {
  return (await noteAccessFor(userId, applicantId)).canView;
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
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  if (!(await hasPermission(userId, permission))) {
    redirect(options?.redirectTo ?? ACCESS_DENIED_REDIRECT);
  }

  return userId;
}

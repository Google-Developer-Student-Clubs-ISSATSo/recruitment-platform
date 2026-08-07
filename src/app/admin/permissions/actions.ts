"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import {
  Committee,
  InviteStatus,
  PermissionKey,
  PermissionSource,
  RoleTemplateName,
} from "@/generated/prisma/enums";
import { isEligibleForLeadRole, LEAD_ROLE_LABELS } from "@/lib/campaign-leads";
import { SEAT_KIND_COMMITTEE, seatKindLabel } from "@/lib/panel-seat-kind";
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

/**
 * One thing a committee change would invalidate, in words the admin can act on.
 */
export type CommitteeImpact = {
  kind: "LEAD_ROLE" | "PANEL_SEAT" | "ADMIN_TRANSFER";
  /** Ready-to-render sentence, e.g. 'MKT Lead of "Recruitment 2026"'. */
  description: string;
};

export type UpdateCommitteeResult =
  | { ok: true; committee: Committee }
  /** Nothing was written — the caller must confirm the listed consequences. */
  | { ok: false; needsConfirmation: true; impacts: CommitteeImpact[] }
  | { ok: false; needsConfirmation?: false; error: string };

/**
 * Everything a move to `next` would break for this user.
 *
 * These are exactly the places `User.committee` is read for a LIVE
 * authorization decision, so this list is the blast radius and nothing else:
 *
 *  - MKT_LEAD / EER_LEAD campaign lead titles (see LEAD_ROLE_COMMITTEE) — the
 *    holder must be in that committee;
 *  - claimed panel seats whose kind names a committee (isEligibleForSeat);
 *  - a pending Administrator transfer invite, which only a TM member may
 *    accept (transfer-admin/actions.ts re-checks committee at accept time).
 *
 * Nothing here is repaired automatically, and the wording says so, because the
 * consequence is subtler than "their authority is revoked". Lead authority is
 * resolved live from the CampaignLead ROW, not from the holder's committee — so
 * an now-ineligible lead keeps the title and everything it can do until a human
 * reassigns it. Likewise a claimed seat: eligibility is checked when a seat is
 * filled, not continuously, so the person stays seated. What actually changes
 * is that they can no longer be PUT there again.
 *
 * That is the accepted design, not an oversight: silently unseating people as a
 * side effect of an account edit is exactly the invisible consequence this
 * confirmation exists to avoid.
 */
async function committeeChangeImpacts(
  userId: string,
  email: string,
  next: Committee,
): Promise<CommitteeImpact[]> {
  const [leads, seats, invite] = await Promise.all([
    prisma.campaignLead.findMany({
      where: { userId },
      select: { role: true, campaign: { select: { name: true } } },
    }),
    prisma.panelSeat.findMany({
      where: { claimedById: userId },
      select: {
        kind: true,
        panel: {
          select: {
            applicant: {
              select: { fullName: true, campaign: { select: { name: true } } },
            },
          },
        },
      },
    }),
    prisma.adminTransferInvite.findFirst({
      where: { invitedEmail: email, status: InviteStatus.PENDING },
      select: { id: true },
    }),
  ]);

  const impacts: CommitteeImpact[] = [];

  for (const lead of leads) {
    if (isEligibleForLeadRole(lead.role, next)) continue;
    impacts.push({
      kind: "LEAD_ROLE",
      description: `${LEAD_ROLE_LABELS[lead.role]} of “${lead.campaign.name}” — they keep the title and its powers until it is reassigned, but they would no longer be eligible for it.`,
    });
  }

  for (const seat of seats) {
    const committee = SEAT_KIND_COMMITTEE[seat.kind];
    if (committee === null || committee === next) continue;
    impacts.push({
      kind: "PANEL_SEAT",
      description: `The ${seatKindLabel(seat.kind)} seat on ${seat.panel.applicant.fullName}’s interview panel (“${seat.panel.applicant.campaign.name}”) — they stay seated, but could not be put back in that seat.`,
    });
  }

  if (invite && next !== Committee.TM) {
    impacts.push({
      kind: "ADMIN_TRANSFER",
      description:
        "A pending Administrator transfer invite — only a TM member can accept one, so it would become unacceptable.",
    });
  }

  return impacts;
}

/**
 * Change a member's home committee.
 *
 * Administrator-only (MANAGE_ACCOUNTS), the same gate as every other action on
 * this screen, and refused for the TM Lead by {@link assertNotLead}: the
 * Administrator must be a TM member by rule, so their committee is not an
 * editable attribute — the role moves via Transfer Admin Role instead.
 *
 * Two-step by design. The first call returns `needsConfirmation` with the list
 * of live authorizations the change would invalidate, and writes nothing; the
 * caller re-submits with `confirmed` once the admin has read it. A change with
 * no entanglements skips straight through — there is nothing to warn about.
 */
export async function updateUserCommittee(
  userId: string,
  committee: Committee,
  confirmed = false,
): Promise<UpdateCommitteeResult> {
  const actorId = await requirePermission(ADMIN);

  if (!(committee in Committee)) {
    return { ok: false, error: "Choose a committee." };
  }
  await assertNotLead(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, committee: true },
  });
  if (!user) return { ok: false, error: "That member no longer exists." };

  if (user.committee === committee) {
    return { ok: true, committee };
  }

  if (!confirmed) {
    const impacts = await committeeChangeImpacts(userId, user.email, committee);
    if (impacts.length > 0) {
      return { ok: false, needsConfirmation: true, impacts };
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { committee } });

  await logActivity({
    actorId,
    actionType: "USER_COMMITTEE_CHANGED",
    targetType: "User",
    targetId: userId,
    // Global, not campaign-scoped: a home committee is an account attribute, so
    // this belongs with USER_CREATED and the permission grants, even though its
    // consequences land inside campaigns. Same treatment those already get.
    details: {
      email: user.email,
      previousCommittee: user.committee,
      committee,
    },
  });

  revalidatePath(PATH);
  return { ok: true, committee };
}

export async function togglePermission(
  userId: string,
  permission: PermissionKey,
  grant: boolean,
): Promise<void> {
  const actorId = await requirePermission(ADMIN);
  // Reject an unknown permission string up front — the value crosses the wire
  // from the client. Mirrors the guard in bulkSetPermission so a hand-crafted
  // call can't reach Prisma with an off-enum value.
  if (!Object.values(PermissionKey).includes(permission)) {
    throw new Error("Unknown permission.");
  }
  await assertNotLead(userId);

  if (grant) {
    const existing = await prisma.userPermission.findFirst({
      where: { userId, permission },
      select: { id: true, source: true },
    });
    if (!existing) {
      await prisma.userPermission.create({
        data: { userId, permission, grantedBy: actorId },
      });
    } else if (existing.source === PermissionSource.LEAD_ROLE) {
      // A direct admin action on an already-held, lead-role-granted
      // permission is an explicit re-confirmation: it overrides the
      // automatic marker so a later lead reassignment can no longer
      // auto-revoke it. See assignCampaignLead in lib/campaign-leads.ts.
      await prisma.userPermission.update({
        where: { id: existing.id },
        data: { source: PermissionSource.MANUAL, grantedBy: actorId },
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

export type BulkPermissionResult = {
  /** Users actually changed — already-granted (or already-absent) are skipped. */
  affectedCount: number;
  /** Selected users skipped because the change was a no-op for them. */
  unchangedCount: number;
  /** Selected users dropped because they are the TM Lead. */
  skippedLeadCount: number;
};

/**
 * Grant or revoke ONE permission across many users at once.
 *
 * The selection arrives from the client, so nothing about it is trusted: the ids
 * are re-read from the database, anyone carrying the TM_LEAD template is dropped
 * (their permissions are fixed — the same rule {@link assertNotLead} enforces for
 * single toggles), and unknown ids simply don't match. A caller hitting this
 * action directly with the TM Lead's id therefore changes nothing.
 *
 * Idempotent per user: granting skips those who already hold the permission,
 * revoking skips those who don't, and neither case is an error — which is what
 * makes "select all matching" safe to use on a mixed group.
 *
 * Exactly one activity entry is written for the whole operation, not one per
 * user: a bulk grant across 40 members would otherwise bury every other event in
 * the log. The affected ids live in that single entry's details.
 */
export async function bulkSetPermission(
  userIds: string[],
  permission: PermissionKey,
  grant: boolean,
): Promise<BulkPermissionResult> {
  const actorId = await requirePermission(ADMIN);

  const requested = [...new Set(userIds)].filter(Boolean);
  if (requested.length === 0) {
    return { affectedCount: 0, unchangedCount: 0, skippedLeadCount: 0 };
  }
  if (!Object.values(PermissionKey).includes(permission)) {
    throw new Error("Unknown permission.");
  }

  const users = await prisma.user.findMany({
    where: { id: { in: requested } },
    select: {
      id: true,
      roleTemplate: { select: { name: true } },
      permissions: { where: { permission }, select: { id: true, source: true } },
    },
  });

  const eligible = users.filter(
    (u) => u.roleTemplate?.name !== RoleTemplateName.TM_LEAD,
  );
  const skippedLeadCount = users.length - eligible.length;

  // Only the users for whom this is a real change.
  const targets = eligible.filter((u) =>
    grant ? u.permissions.length === 0 : u.permissions.length > 0,
  );
  // Users who already hold the permission, but only via an auto-grant from a
  // lead role: an explicit bulk grant is still a direct admin action on them,
  // so it overrides the automatic marker the same way a single toggle does
  // (see togglePermission above), even though the permission itself doesn't
  // change.
  const sourceUpgradeTargets = grant
    ? eligible.filter((u) => u.permissions[0]?.source === PermissionSource.LEAD_ROLE)
    : [];
  const affectedUserIds = [
    ...targets.map((u) => u.id),
    ...sourceUpgradeTargets.map((u) => u.id),
  ];

  if (affectedUserIds.length > 0) {
    if (grant) {
      await prisma.userPermission.createMany({
        data: targets.map((u) => ({
          userId: u.id,
          permission,
          grantedBy: actorId,
        })),
        // Belt and braces alongside the filter above: a concurrent single toggle
        // between the read and this write would otherwise hit the
        // @@unique([userId, permission]) constraint and fail the whole batch.
        skipDuplicates: true,
      });
      if (sourceUpgradeTargets.length > 0) {
        await prisma.userPermission.updateMany({
          where: {
            userId: { in: sourceUpgradeTargets.map((u) => u.id) },
            permission,
          },
          data: { source: PermissionSource.MANUAL, grantedBy: actorId },
        });
      }
    } else {
      await prisma.userPermission.deleteMany({
        where: { userId: { in: affectedUserIds }, permission },
      });
    }

    await logActivity({
      actorId,
      actionType: grant
        ? "BULK_PERMISSION_GRANTED"
        : "BULK_PERMISSION_REVOKED",
      targetType: "User",
      // No single target — the affected ids live in details instead.
      details: {
        permission,
        affectedUserIds,
        affectedCount: affectedUserIds.length,
      },
    });
  }

  revalidatePath(PATH);
  return {
    affectedCount: affectedUserIds.length,
    unchangedCount: eligible.length - affectedUserIds.length,
    skippedLeadCount,
  };
}

export type BulkDeletePreviewUser = { id: string; name: string; email: string };

export type BulkDeletePreview = {
  /** Users that would actually be deleted, for the confirmation dialog to list by name. */
  eligible: BulkDeletePreviewUser[];
  /** Selected users dropped because they are the TM Lead. */
  skippedLeadCount: number;
  /** Selected users dropped because it's the acting admin's own account. */
  skippedSelfCount: number;
};

/**
 * Re-reads the current selection from the database so the confirmation dialog
 * can list exactly who will be deleted by name/email — never trusting
 * client-held rows, which may be stale or (for a cross-page "select all
 * matching" selection) not held by the client at all.
 */
export async function previewBulkDelete(
  userIds: string[],
): Promise<BulkDeletePreview> {
  const actorId = await requirePermission(ADMIN);

  const requested = [...new Set(userIds)].filter(Boolean);
  if (requested.length === 0) {
    return { eligible: [], skippedLeadCount: 0, skippedSelfCount: 0 };
  }

  const users = await prisma.user.findMany({
    where: { id: { in: requested } },
    select: {
      id: true,
      name: true,
      email: true,
      roleTemplate: { select: { name: true } },
    },
  });

  const skippedSelfCount = users.filter((u) => u.id === actorId).length;
  const withoutSelf = users.filter((u) => u.id !== actorId);
  const eligible = withoutSelf.filter(
    (u) => u.roleTemplate?.name !== RoleTemplateName.TM_LEAD,
  );
  const skippedLeadCount = withoutSelf.length - eligible.length;

  return {
    eligible: eligible.map((u) => ({
      id: u.id,
      name: u.name ?? u.email,
      email: u.email,
    })),
    skippedLeadCount,
    skippedSelfCount,
  };
}

export type BulkDeleteResult = {
  deletedCount: number;
  skippedLeadCount: number;
  skippedSelfCount: number;
};

/**
 * Permanently remove many members in one batch. Mirrors {@link deleteUser}'s
 * FK cleanup (ActivityLogEntry.actor and AdminTransferInvite.initiator are
 * NOT cascaded) but does it once for the whole batch via deleteMany, not in a
 * loop of individual deletes. The acting admin's own account and the TM
 * Lead's are always dropped server-side regardless of what the client sent —
 * the same rules {@link assertNotLead} and the self-guard in {@link deleteUser}
 * enforce for a single delete.
 *
 * Exactly one activity entry is written for the whole operation.
 */
export async function bulkDeleteUsers(
  userIds: string[],
): Promise<BulkDeleteResult> {
  const actorId = await requirePermission(ADMIN);

  const requested = [...new Set(userIds)].filter(Boolean);
  if (requested.length === 0) {
    return { deletedCount: 0, skippedLeadCount: 0, skippedSelfCount: 0 };
  }

  const users = await prisma.user.findMany({
    where: { id: { in: requested } },
    select: {
      id: true,
      email: true,
      roleTemplate: { select: { name: true } },
    },
  });

  const skippedSelfCount = users.filter((u) => u.id === actorId).length;
  const withoutSelf = users.filter((u) => u.id !== actorId);
  const eligible = withoutSelf.filter(
    (u) => u.roleTemplate?.name !== RoleTemplateName.TM_LEAD,
  );
  const skippedLeadCount = withoutSelf.length - eligible.length;
  const deletedUserIds = eligible.map((u) => u.id);

  if (deletedUserIds.length > 0) {
    await prisma.$transaction([
      prisma.activityLogEntry.deleteMany({
        where: { actorId: { in: deletedUserIds } },
      }),
      prisma.adminTransferInvite.deleteMany({
        where: { initiatedBy: { in: deletedUserIds } },
      }),
      prisma.user.deleteMany({ where: { id: { in: deletedUserIds } } }),
    ]);

    await logActivity({
      actorId,
      actionType: "BULK_USER_DELETED",
      targetType: "User",
      details: {
        deletedEmails: eligible.map((u) => u.email),
        deletedCount: deletedUserIds.length,
      },
    });
  }

  revalidatePath(PATH);
  return {
    deletedCount: deletedUserIds.length,
    skippedLeadCount,
    skippedSelfCount,
  };
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

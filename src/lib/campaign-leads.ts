import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { LeadRole, PermissionKey, PermissionSource } from "@/generated/prisma/enums";

/** Every appointable lead role, in the display order used by the assignment UI. */
export const LEAD_ROLES: LeadRole[] = [
  LeadRole.MKT_LEAD,
  LeadRole.EER_LEAD,
  LeadRole.CLUB_LEAD,
  LeadRole.TECHNICAL_LEAD,
];

export const LEAD_ROLE_LABELS: Record<LeadRole, string> = {
  [LeadRole.MKT_LEAD]: "MKT Lead",
  [LeadRole.EER_LEAD]: "EER Lead",
  [LeadRole.CLUB_LEAD]: "Club Lead",
  [LeadRole.TECHNICAL_LEAD]: "Technical Lead",
};

/**
 * The one permission a lead role auto-grants/auto-revokes on assignment, if
 * any. Only TECHNICAL_LEAD has one today — MKT/EER/Club Lead are tracked
 * titles with no attached capability yet.
 */
const AUTO_GRANTED_PERMISSION: Partial<Record<LeadRole, PermissionKey>> = {
  [LeadRole.TECHNICAL_LEAD]: PermissionKey.ENTER_TECHNICAL_SCORE,
};

export type LeadHolder = { userId: string; name: string; email: string } | null;

/** Current holder of each of the four lead roles for a campaign, keyed by role. */
export async function getCampaignLeadHolders(
  campaignId: string,
): Promise<Record<LeadRole, LeadHolder>> {
  const rows = await prisma.campaignLead.findMany({
    where: { campaignId },
    select: {
      role: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const holders = Object.fromEntries(
    LEAD_ROLES.map((role) => [role, null]),
  ) as Record<LeadRole, LeadHolder>;

  for (const row of rows) {
    holders[row.role] = {
      userId: row.user.id,
      name: row.user.name ?? row.user.email,
      email: row.user.email,
    };
  }
  return holders;
}

/**
 * Assign (or reassign) a lead role for a campaign, handling the
 * TECHNICAL_LEAD auto-grant/auto-revoke side effect.
 *
 * - The CampaignLead row for (campaignId, role) is upserted — reassigning
 *   updates the existing row's userId rather than creating a second one.
 * - If this role auto-grants a permission (currently only TECHNICAL_LEAD ->
 *   ENTER_TECHNICAL_SCORE): the new holder gets it with source LEAD_ROLE
 *   unless they already hold it (any source, left untouched); the previous
 *   holder loses it ONLY if their row's source is still LEAD_ROLE — a MANUAL
 *   grant (whether pre-existing or later re-confirmed via Permission
 *   Management, see togglePermission/bulkSetPermission) is never auto-revoked.
 *
 * Every assignment, and every auto-grant/auto-revoke side effect, gets its
 * own logActivity entry so the Activity Log stays honest about what was a
 * direct admin action versus an automatic consequence of one.
 */
export async function assignCampaignLead({
  campaignId,
  role,
  userId,
  actorId,
}: {
  campaignId: string;
  role: LeadRole;
  userId: string;
  actorId: string;
}): Promise<void> {
  const previous = await prisma.campaignLead.findUnique({
    where: { campaignId_role: { campaignId, role } },
    select: { userId: true },
  });
  const previousUserId = previous?.userId;

  await prisma.campaignLead.upsert({
    where: { campaignId_role: { campaignId, role } },
    create: { campaignId, role, userId, assignedById: actorId },
    update: { userId, assignedById: actorId, assignedAt: new Date() },
  });

  await logActivity({
    actorId,
    actionType: previousUserId ? "CAMPAIGN_LEAD_REASSIGNED" : "CAMPAIGN_LEAD_ASSIGNED",
    targetType: "CampaignLead",
    targetId: userId,
    details: { campaignId, role, userId, previousUserId: previousUserId ?? null },
  });

  const autoPermission = AUTO_GRANTED_PERMISSION[role];
  if (!autoPermission) return;

  // Revoke from the previous holder first, only if this lead role is what
  // granted it and someone else is taking over the role.
  if (previousUserId && previousUserId !== userId) {
    const previousGrant = await prisma.userPermission.findUnique({
      where: { userId_permission: { userId: previousUserId, permission: autoPermission } },
      select: { id: true, source: true },
    });
    if (previousGrant && previousGrant.source === PermissionSource.LEAD_ROLE) {
      await prisma.userPermission.delete({ where: { id: previousGrant.id } });
      await logActivity({
        actorId,
        actionType: "PERMISSION_AUTO_REVOKED",
        targetType: "User",
        targetId: previousUserId,
        details: {
          permission: autoPermission,
          reason: `Automatically revoked: no longer ${LEAD_ROLE_LABELS[role]} for this campaign.`,
          campaignId,
          role,
        },
      });
    }
  }

  // Grant to the new holder, unless they already hold it (any source).
  const existingGrant = await prisma.userPermission.findUnique({
    where: { userId_permission: { userId, permission: autoPermission } },
    select: { id: true },
  });
  if (!existingGrant) {
    await prisma.userPermission.create({
      data: {
        userId,
        permission: autoPermission,
        grantedBy: actorId,
        source: PermissionSource.LEAD_ROLE,
      },
    });
    await logActivity({
      actorId,
      actionType: "PERMISSION_AUTO_GRANTED",
      targetType: "User",
      targetId: userId,
      details: {
        permission: autoPermission,
        reason: `Automatically granted: assigned as ${LEAD_ROLE_LABELS[role]} for this campaign.`,
        campaignId,
        role,
      },
    });
  }
}

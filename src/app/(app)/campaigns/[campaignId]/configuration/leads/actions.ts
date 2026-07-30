"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import type { LeadRole } from "@/generated/prisma/enums";
import { assignCampaignLead, LEAD_ROLES } from "@/lib/campaign-leads";

// Campaign Leads are Administrator-only, same MANAGE_ACCOUNTS gate the rest of
// the admin-exclusive surface uses (Permission Management, Transfer Admin
// Role) — not a new gating mechanism.
const ADMIN = PermissionKey.MANAGE_ACCOUNTS;

export async function assignLead(
  campaignId: string,
  role: LeadRole,
  userId: string,
): Promise<void> {
  const actorId = await requirePermission(ADMIN);

  if (!LEAD_ROLES.includes(role)) {
    throw new Error("Unknown lead role.");
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    throw new Error("That member no longer exists.");
  }

  await assignCampaignLead({ campaignId, role, userId, actorId });

  revalidatePath(`/campaigns/${campaignId}/configuration`);
}

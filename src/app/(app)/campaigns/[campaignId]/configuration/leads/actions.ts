"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import type { LeadRole } from "@/generated/prisma/enums";
import {
  assignCampaignLead,
  isEligibleForLeadRole,
  LEAD_ROLES,
  LEAD_ROLE_COMMITTEE,
  LEAD_ROLE_LABELS,
} from "@/lib/campaign-leads";

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
    select: { id: true, name: true, email: true, committee: true },
  });
  if (!user) {
    throw new Error("That member no longer exists.");
  }

  // The committee rule is enforced HERE, not only by the filtered picker. The
  // picker is a client component receiving a list of options over the wire, so
  // a direct call to this action can name anyone — the narrowed <select> is a
  // convenience, this is the boundary.
  if (!isEligibleForLeadRole(role, user.committee)) {
    const required = LEAD_ROLE_COMMITTEE[role];
    throw new Error(
      `${user.name ?? user.email} is in ${user.committee}, so they can't be ${LEAD_ROLE_LABELS[role]} — that title is held by a ${required} member.`,
    );
  }

  await assignCampaignLead({ campaignId, role, userId, actorId });

  revalidatePath(`/campaigns/${campaignId}/configuration`);
}

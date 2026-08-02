"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { PermissionKey } from "@/generated/prisma/enums";
import { saveCapacityTargets } from "@/lib/committee-capacity-store";
import type { CapacityTargets } from "@/lib/committee-capacity";

// Committee capacity mutations. Same shape as the scoring actions next door:
// gated by its own permission server-side (MANAGE_CAPACITY — hiding the section
// in the UI is not the check), and scoped to the campaignId from the route.

const CAPACITY = PermissionKey.MANAGE_CAPACITY;

/**
 * Save all three committee targets together. Returns what was actually stored,
 * so the form can re-seed its fields from the sanitized values.
 */
export async function updateCommitteeCapacity(
  campaignId: string,
  targets: CapacityTargets,
): Promise<CapacityTargets> {
  const actorId = await requirePermission(CAPACITY);

  const saved = await saveCapacityTargets(campaignId, targets);

  await logActivity({
    actorId,
    actionType: "CAPACITY_UPDATED",
    targetType: "CommitteeCapacity",
    targetId: campaignId,
    campaignId,
    details: saved,
  });

  revalidatePath(`/campaigns/${campaignId}/configuration`);

  return saved;
}

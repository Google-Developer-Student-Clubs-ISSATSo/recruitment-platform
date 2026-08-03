"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { PermissionKey } from "@/generated/prisma/enums";
import { savePanelSize } from "@/lib/interview-config";
import { isPanelSize, type PanelSize } from "@/lib/panel-size";

// Interview settings. Gated by MANAGE_CAPACITY — the same permission that owns
// committee capacity next door: both are "how big is the thing we're running"
// numbers set by whoever plans the cycle, not by whoever screens applicants.

const CAPACITY = PermissionKey.MANAGE_CAPACITY;

export type SavePanelSizeResult =
  | { ok: true; panelSize: PanelSize }
  | { ok: false; error: string };

export async function updatePanelSize(
  campaignId: string,
  size: number,
): Promise<SavePanelSizeResult> {
  const actorId = await requirePermission(CAPACITY);

  // Re-validated server-side: the form only offers 3 and 4, but the action is
  // reachable by POST with any number.
  if (!isPanelSize(size)) {
    return { ok: false, error: "A panel is either 3 or 4 seats." };
  }

  const saved = await savePanelSize(campaignId, size);

  await logActivity({
    actorId,
    actionType: "INTERVIEW_PANEL_SIZE_SET",
    targetType: "Campaign",
    targetId: campaignId,
    campaignId,
    details: { panelSize: saved },
  });

  revalidatePath(`/campaigns/${campaignId}/configuration`);
  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return { ok: true, panelSize: saved };
}

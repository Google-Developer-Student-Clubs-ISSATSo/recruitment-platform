"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasAnyPermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { CAMPAIGN_CREATE_PERMISSIONS } from "@/lib/route-permissions";

export type CreateCampaignState = {
  status: "idle" | "success" | "error";
  message?: string;
};

// Create a new campaign. Gated by MANAGE_CAMPAIGNS or MANAGE_ACCOUNTS — checked
// server-side here, not just hidden in the UI. Logs a CAMPAIGN_CREATED audit
// entry so the action shows up in the activity log.
export async function createCampaign(
  _prev: CreateCampaignState,
  formData: FormData,
): Promise<CreateCampaignState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { status: "error", message: "You are signed out." };

  if (!(await hasAnyPermission(userId, CAMPAIGN_CREATE_PERMISSIONS))) {
    return {
      status: "error",
      message: "You don't have permission to create campaigns.",
    };
  }

  const name = String(formData.get("name") ?? "").trim();
  // A checked box submits value "true"; an unchecked box omits the field
  // entirely. The modal defaults the box to checked, so new campaigns are open
  // unless the creator unticks it.
  const isOpen = formData.get("isOpen") === "true";

  if (!name) return { status: "error", message: "Enter a campaign name." };

  const campaign = await prisma.campaign.create({
    data: { name, isOpen },
  });

  await logActivity({
    actorId: userId,
    actionType: "CAMPAIGN_CREATED",
    targetType: "Campaign",
    targetId: campaign.id,
    details: { name },
  });

  revalidatePath("/campaigns");
  return { status: "success", message: `Campaign "${name}" was created.` };
}

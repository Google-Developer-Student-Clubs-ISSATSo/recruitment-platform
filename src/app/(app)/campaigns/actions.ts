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
    campaignId: campaign.id,
    details: { name },
  });

  revalidatePath("/campaigns");
  return { status: "success", message: `Campaign "${name}" was created.` };
}

/**
 * Open or close a campaign. Same permission bar as creating one
 * (MANAGE_CAMPAIGNS / MANAGE_ACCOUNTS), enforced here rather than only hiding the
 * toggle. Closing matters: per the campaign-scoping rules a closed campaign is
 * only enterable by VIEW_CAMPAIGN_HISTORY / MANAGE_ACCOUNTS holders (see the
 * campaign layout guard), so flipping this changes who can reach the campaign.
 */
export async function setCampaignStatus(
  campaignId: string,
  isOpen: boolean,
): Promise<{ ok: true; isOpen: boolean } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You are signed out." };

  if (!(await hasAnyPermission(userId, CAMPAIGN_CREATE_PERMISSIONS))) {
    return { ok: false, error: "You don't have permission to change a campaign's status." };
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, isOpen: true },
  });
  if (!campaign) return { ok: false, error: "That campaign doesn't exist." };

  // No-op if it's already in the requested state — don't log a status change
  // that didn't happen.
  if (campaign.isOpen === isOpen) {
    return { ok: true, isOpen };
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { isOpen },
  });

  await logActivity({
    actorId: userId,
    actionType: "CAMPAIGN_STATUS_CHANGED",
    targetType: "Campaign",
    targetId: campaignId,
    campaignId,
    details: { name: campaign.name, newStatus: isOpen ? "OPEN" : "CLOSED" },
  });

  revalidatePath("/campaigns");
  return { ok: true, isOpen };
}

/**
 * Permanently delete a campaign and everything scoped to it. Same permission bar
 * as creating one (MANAGE_CAMPAIGNS / MANAGE_ACCOUNTS), enforced here rather than
 * only hiding the control.
 *
 * The caller must echo back the campaign's exact name — the UI gates the button
 * on it, and it is re-checked server-side so the action can't be driven directly
 * with the wrong id.
 *
 * Deletion order is explicit and NOT left to the database: only PhaseOneQuestion
 * and PhaseOneConfig cascade from Campaign, and only PhaseOneScore/PhaseOneResult
 * cascade from Applicant. Applicant→Campaign and both EmailLog relations have no
 * onDelete rule, so they default to Restrict and a bare campaign.delete() fails
 * with a foreign-key error the moment a campaign has any applicant. Email logs go
 * first (they reference both applicant and campaign), then applicants (taking
 * their scores and results with them), then the campaign itself (taking questions
 * and config). One transaction, so a half-deleted campaign is never observable.
 */
export async function deleteCampaign(
  campaignId: string,
  confirmationName: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You are signed out." };

  if (!(await hasAnyPermission(userId, CAMPAIGN_CREATE_PERMISSIONS))) {
    return { ok: false, error: "You don't have permission to delete campaigns." };
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, _count: { select: { applicants: true } } },
  });
  if (!campaign) return { ok: false, error: "That campaign doesn't exist." };

  if (confirmationName.trim() !== campaign.name) {
    return { ok: false, error: "The name you typed doesn't match this campaign." };
  }

  // Counted before the delete — afterwards there is nothing left to count.
  const applicantCount = campaign._count.applicants;

  await prisma.$transaction([
    prisma.emailLog.deleteMany({ where: { campaignId } }),
    prisma.applicant.deleteMany({ where: { campaignId } }),
    prisma.campaign.delete({ where: { id: campaignId } }),
  ]);

  await logActivity({
    actorId: userId,
    actionType: "CAMPAIGN_DELETED",
    targetType: "Campaign",
    targetId: campaignId,
    campaignId,
    details: { name: campaign.name, applicantCount },
  });

  revalidatePath("/campaigns");
  return { ok: true, name: campaign.name };
}

"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { PermissionKey } from "@/generated/prisma/enums";
import {
  FINAL_EMAIL_LINK_FIELDS,
  normalizeLink,
  type FinalEmailLinks,
} from "@/lib/final-email-links";

// Gated by SEND_EMAILS, not the other configuration permissions: these four
// values only ever affect what goes out in the final-result emails, so the
// people who send those emails are the ones who own them.

const SEND = PermissionKey.SEND_EMAILS;

export type SaveLinksResult =
  | { ok: true; links: FinalEmailLinks }
  | { ok: false; error: string };

export async function updateFinalEmailLinksAction(
  campaignId: string,
  input: Record<string, string>,
): Promise<SaveLinksResult> {
  const actorId = await requirePermission(SEND);

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!campaign) return { ok: false, error: "That campaign doesn't exist." };

  // Only the four known keys are read off the submitted object — anything else
  // the client sends is ignored rather than passed through to the update.
  const data = Object.fromEntries(
    FINAL_EMAIL_LINK_FIELDS.map((f) => [
      f.key,
      normalizeLink(input[f.key] ?? ""),
    ]),
  ) as FinalEmailLinks;

  const saved = await prisma.campaign.update({
    where: { id: campaignId },
    data,
    select: {
      acceptanceFormLink: true,
      gdgcProgramLink: true,
      gdgcPlatformLink: true,
      discordInviteLink: true,
    },
  });

  await logActivity({
    actorId,
    actionType: "FINAL_EMAIL_LINKS_UPDATED",
    targetType: "Campaign",
    targetId: campaignId,
    campaignId,
    // The URLs themselves are logged: they are what actually reached applicants,
    // and "which link did we send that cycle?" is the question this row answers.
    details: saved,
  });

  revalidatePath(`/campaigns/${campaignId}/configuration`);
  revalidatePath(`/campaigns/${campaignId}/final-decision`);

  return { ok: true, links: saved };
}

"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { activityLogWrite } from "@/lib/activity-log";
import { PermissionKey } from "@/generated/prisma/enums";

import {
  DELETE_ALL_LOGS_PHRASE,
  DELETE_CAMPAIGN_LOGS_PHRASE,
} from "./delete-log-phrases";

// Deleting audit history is the Administrator's alone — the same MANAGE_ACCOUNTS
// gate the /admin section and the admin-transfer actions use, which in this app
// means the single TM_LEAD holder. VIEW_ACTIVITY_LOG gets you the page; it does
// not get you this.
const ADMIN = PermissionKey.MANAGE_ACCOUNTS;

type DeleteLogsResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * Delete every activity-log entry scoped to one campaign, leaving other
 * campaigns' entries and all global entries untouched.
 *
 * The deletion is then logged as a GLOBAL entry — same self-reference reasoning
 * as CAMPAIGN_DELETED: an entry recording the clearing of a campaign's scope
 * cannot itself live in that scope, or it would be erased by the next run of the
 * very action it describes. Written in the same transaction as the delete, so
 * the record and the act stand or fall together.
 */
export async function deleteCampaignLogs(
  campaignId: string,
  confirmation: string,
): Promise<DeleteLogsResult> {
  const actorId = await requirePermission(ADMIN);

  if (confirmation.trim() !== DELETE_CAMPAIGN_LOGS_PHRASE) {
    return { ok: false, error: "The confirmation phrase doesn't match." };
  }
  if (!campaignId.trim()) {
    return { ok: false, error: "Pick a campaign first." };
  }

  // The campaign may already be deleted — its entries are still filterable by
  // the now-orphaned id, so this resolves a name for the record if there is one
  // and falls back rather than refusing.
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { name: true },
  });

  const count = await prisma.activityLogEntry.count({ where: { campaignId } });
  if (count === 0) {
    return { ok: false, error: "That campaign has no log entries to delete." };
  }

  await prisma.$transaction([
    prisma.activityLogEntry.deleteMany({ where: { campaignId } }),
    activityLogWrite({
      actorId,
      actionType: "ACTIVITY_LOG_PURGED",
      targetType: "Campaign",
      targetId: campaignId,
      details: {
        scope: "campaign",
        campaignName: campaign?.name ?? "Deleted campaign",
        deletedCount: count,
      },
    }),
  ]);

  revalidatePath("/activity-log");
  return { ok: true, count };
}

/**
 * Delete the entire activity log, global entries included.
 *
 * There is deliberately no log entry for this one: the table cannot hold a
 * record of its own total wipe, and writing one afterwards would mean the log
 * always shows exactly one row claiming everything before it is gone — a record
 * the next wipe erases anyway. The surviving trail is a server-side console.error
 * (the app's existing server-log convention, as in the applicant-submission
 * webhook), which lands in Vercel's runtime logs where it is outside the reach
 * of this action. It is the ONLY evidence this ever happened, so it is written
 * before the response returns and deliberately shouts.
 */
export async function deleteAllLogs(
  confirmation: string,
): Promise<DeleteLogsResult> {
  const actorId = await requirePermission(ADMIN);

  if (confirmation.trim() !== DELETE_ALL_LOGS_PHRASE) {
    return { ok: false, error: "The confirmation phrase doesn't match." };
  }

  // Read before the delete — afterwards there is nothing left to attribute it
  // to, and the console line is the only place either fact will survive.
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { name: true, email: true },
  });

  const { count } = await prisma.activityLogEntry.deleteMany({});

  console.error(
    `[activity-log] !!! ENTIRE ACTIVITY LOG DELETED !!! ${count} entr${
      count === 1 ? "y" : "ies"
    } removed by ${actor?.name ?? "unknown user"} <${
      actor?.email ?? "unknown email"
    }> (user ${actorId}) at ${new Date().toISOString()}. This is irreversible, ` +
      `and this line is the only surviving record of it.`,
  );

  revalidatePath("/activity-log");
  return { ok: true, count };
}

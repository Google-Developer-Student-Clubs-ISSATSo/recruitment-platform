"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { PermissionKey } from "@/generated/prisma/enums";

// MKT skill whitelist mutations. Same three rules as the scoring config actions
// next door:
//   - gated by CONFIGURE_SCREENING, re-checked here rather than only hidden in
//     the UI — a direct POST still hits requirePermission;
//   - scoped to the campaignId from the route — a row is only ever touched
//     after confirming it belongs to that campaign;
//   - audited via logActivity, one entry per add and per removal, so the list's
//     history reads as individual decisions rather than a bulk overwrite.
//
// Every change is retroactive by construction: the Phase 2 tally is computed
// live from these rows, so nothing needs recounting after one.

const SCREEN = PermissionKey.CONFIGURE_SCREENING;

function pathFor(campaignId: string) {
  return `/campaigns/${campaignId}/configuration`;
}

/** Longest skill name we'll store — a form option, not a sentence. */
const MAX_SKILL_LENGTH = 80;

export type MktSkillResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Add one skill to this campaign's whitelist.
 *
 * The duplicate check is case-INSENSITIVE, which the `@@unique([campaignId,
 * skillName])` constraint on its own is not: Postgres unique indexes compare
 * exactly, so "marketing" and "Marketing" would both be storable while the
 * tally treats them as the same skill — two config rows for one table row, with
 * a removal that only half works.
 */
export async function addMktSkill(
  campaignId: string,
  skillName: string,
): Promise<MktSkillResult> {
  const actorId = await requirePermission(SCREEN);

  const name = skillName.trim();
  if (name === "") return { ok: false, error: "Enter a skill name." };
  if (name.length > MAX_SKILL_LENGTH)
    return { ok: false, error: `Keep it under ${MAX_SKILL_LENGTH} characters.` };

  const existing = await prisma.mktSkillWhitelist.findFirst({
    where: { campaignId, skillName: { equals: name, mode: "insensitive" } },
    select: { skillName: true },
  });
  if (existing) {
    return { ok: false, error: `“${existing.skillName}” is already on the list.` };
  }

  const created = await prisma.mktSkillWhitelist.create({
    data: { campaignId, skillName: name },
    select: { id: true },
  });

  await logActivity({
    actorId,
    actionType: "MKT_SKILL_ADDED",
    targetType: "MktSkillWhitelist",
    targetId: created.id,
    campaignId,
    details: { skillName: name },
  });

  revalidatePath(pathFor(campaignId));
  // The Phase 2 tally reads these rows, so its cached render is now stale.
  revalidatePath(`/campaigns/${campaignId}/phase2`);
  return { ok: true };
}

/** Remove one skill. Scoped: a row belonging to another campaign is a no-op. */
export async function removeMktSkill(
  campaignId: string,
  skillId: string,
): Promise<MktSkillResult> {
  const actorId = await requirePermission(SCREEN);

  const owned = await prisma.mktSkillWhitelist.findUnique({
    where: { id: skillId },
    select: { id: true, campaignId: true, skillName: true },
  });
  if (!owned || owned.campaignId !== campaignId) {
    return { ok: false, error: "That skill is no longer on the list." };
  }

  await prisma.mktSkillWhitelist.delete({ where: { id: skillId } });

  await logActivity({
    actorId,
    actionType: "MKT_SKILL_REMOVED",
    targetType: "MktSkillWhitelist",
    targetId: skillId,
    campaignId,
    details: { skillName: owned.skillName },
  });

  revalidatePath(pathFor(campaignId));
  revalidatePath(`/campaigns/${campaignId}/phase2`);
  return { ok: true };
}

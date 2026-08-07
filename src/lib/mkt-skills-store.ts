// Database reads and writes for the per-campaign MKT skill whitelist. The pure
// matching/tally logic lives in phase2.ts, which client components import; this
// module is server-only, same split as phase2.ts vs. phase2-store.ts.

import { prisma } from "@/lib/prisma";
import { DEFAULT_MKT_SKILLS } from "@/lib/mkt-skills";

export type MktSkill = { id: string; skillName: string };

/** One campaign's whitelist, alphabetical — the order the config list renders. */
export async function getMktSkillWhitelist(
  campaignId: string,
): Promise<MktSkill[]> {
  const rows = await prisma.mktSkillWhitelist.findMany({
    where: { campaignId },
    select: { id: true, skillName: true },
    orderBy: { skillName: "asc" },
  });
  return rows;
}

/**
 * Seed a new campaign's whitelist with {@link DEFAULT_MKT_SKILLS}.
 *
 * `skipDuplicates` rather than a pre-check: this only ever runs at creation, but
 * making it idempotent means a re-run can't fail the campaign-create action on a
 * unique violation.
 */
export function seedMktSkillWhitelist(campaignId: string) {
  return prisma.mktSkillWhitelist.createMany({
    data: DEFAULT_MKT_SKILLS.map((skillName) => ({ campaignId, skillName })),
    skipDuplicates: true,
  });
}

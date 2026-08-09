import { prisma } from "@/lib/prisma";
import type { LeadRole } from "@/generated/prisma/enums";

/**
 * Which lead roles each user holds, for colour resolution
 * (see identity-color.ts). Keyed by userId; users with no lead title are
 * simply absent.
 *
 * `campaignId` scopes it to one campaign. Omit it on GLOBAL screens
 * (Permission Management, the app shell) where there is no current campaign:
 * roles are then gathered across every OPEN campaign, so a Club Lead of the
 * running cycle still reads as one. Closed campaigns are excluded on purpose —
 * a title from a finished cycle is history, not present identity.
 */
export async function getLeadRolesByUser(
  campaignId?: string,
): Promise<Map<string, LeadRole[]>> {
  const rows = await prisma.campaignLead.findMany({
    where: campaignId ? { campaignId } : { campaign: { isOpen: true } },
    select: { userId: true, role: true },
  });

  const byUser = new Map<string, LeadRole[]>();
  for (const row of rows) {
    const existing = byUser.get(row.userId);
    if (existing) existing.push(row.role);
    else byUser.set(row.userId, [row.role]);
  }
  return byUser;
}

/** The lead roles one user holds, same scoping rules as {@link getLeadRolesByUser}. */
export async function getLeadRolesForUser(
  userId: string,
  campaignId?: string,
): Promise<LeadRole[]> {
  const rows = await prisma.campaignLead.findMany({
    where: campaignId
      ? { campaignId, userId }
      : { userId, campaign: { isOpen: true } },
    select: { role: true },
  });
  return rows.map((r) => r.role);
}

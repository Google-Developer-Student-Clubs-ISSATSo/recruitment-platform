// Database access for the two Phase 2 visibility switches. The rule they feed
// is pure and lives in phase2-visibility.ts; this module is server-only, the
// same split phase2.ts / phase2-store.ts already uses.

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { getCampaignLeadHolders, LEAD_ROLES } from "@/lib/campaign-leads";
import { getAdministratorId } from "@/lib/panel-authority";
import type { LeadRole } from "@/generated/prisma/enums";
import type {
  Phase2Surface,
  Phase2Viewer,
  Phase2VisibilityState,
} from "@/lib/phase2-visibility";

/**
 * Both switches for one campaign.
 *
 * A missing row reads as fully OPEN rather than being created on demand — the
 * absence IS the default, so a campaign nobody has configured behaves exactly
 * as it did before this feature existed. The row is written only when an
 * Administrator actually closes something (see setPhase2SurfaceClosed).
 */
export async function getPhase2VisibilityState(
  campaignId: string,
): Promise<Phase2VisibilityState> {
  const config = await prisma.phase2VisibilityConfig.findUnique({
    where: { campaignId },
    select: { notesClosedAt: true, flagsClosedAt: true },
  });
  return {
    notesClosed: config?.notesClosedAt != null,
    flagsClosed: config?.flagsClosedAt != null,
  };
}

/**
 * Resolve who this viewer is, for the visibility rule.
 *
 * Both halves are read LIVE from the current TM_LEAD and the current
 * CampaignLead rows, never from a stored flag — the same reasoning
 * canViewMktSkills documents: access must move with the title the moment it is
 * reassigned, so an outgoing MKT Lead loses their read-through on their next
 * load and the incoming one gains it without any migration of state.
 *
 * Lead titles are scoped to THIS campaign, so a lead of a different campaign
 * gets nothing here.
 */
export async function getPhase2Viewer(
  campaignId: string,
  userId: string,
): Promise<Phase2Viewer> {
  const [holders, administratorId] = await Promise.all([
    getCampaignLeadHolders(campaignId),
    getAdministratorId(),
  ]);

  const leadRoles: LeadRole[] = LEAD_ROLES.filter(
    (role) => holders[role]?.userId === userId,
  );

  return { isAdministrator: administratorId === userId, leadRoles };
}

/** Who set each switch, for the Configuration section's caption. */
export type Phase2VisibilityDetail = Phase2VisibilityState & {
  notesClosedAtISO: string | null;
  notesClosedByName: string | null;
  flagsClosedAtISO: string | null;
  flagsClosedByName: string | null;
};

/** The state plus its provenance — read only by the Administrator's config UI. */
export async function getPhase2VisibilityDetail(
  campaignId: string,
): Promise<Phase2VisibilityDetail> {
  const config = await prisma.phase2VisibilityConfig.findUnique({
    where: { campaignId },
    select: {
      notesClosedAt: true,
      flagsClosedAt: true,
      notesClosedBy: { select: { name: true, email: true } },
      flagsClosedBy: { select: { name: true, email: true } },
    },
  });

  return {
    notesClosed: config?.notesClosedAt != null,
    flagsClosed: config?.flagsClosedAt != null,
    notesClosedAtISO: config?.notesClosedAt?.toISOString() ?? null,
    // Name is nullable in the Auth.js schema — fall back to the email rather
    // than attributing the change to nobody, same as the entry log does.
    notesClosedByName:
      config?.notesClosedBy?.name ?? config?.notesClosedBy?.email ?? null,
    flagsClosedAtISO: config?.flagsClosedAt?.toISOString() ?? null,
    flagsClosedByName:
      config?.flagsClosedBy?.name ?? config?.flagsClosedBy?.email ?? null,
  };
}

/**
 * Open or close one surface. Upserts, so the first close on a campaign creates
 * the row and every later toggle updates it; reopening clears both the
 * timestamp and the actor, exactly as reopenInterviewNote does, so a reopened
 * switch carries no stale "closed by" attribution.
 *
 * Authorization is the caller's job (see the action) — this mirrors
 * closeInterviewNote / reopenInterviewNote, which are likewise unguarded here
 * and guarded at their action.
 */
export async function setPhase2SurfaceClosed({
  campaignId,
  surface,
  closed,
  userId,
}: {
  campaignId: string;
  surface: Phase2Surface;
  closed: boolean;
  userId: string;
}): Promise<void> {
  const value = closed
    ? { at: new Date(), by: userId }
    : { at: null, by: null };

  const data =
    surface === "notes"
      ? { notesClosedAt: value.at, notesClosedById: value.by }
      : { flagsClosedAt: value.at, flagsClosedById: value.by };

  await prisma.phase2VisibilityConfig.upsert({
    where: { campaignId },
    create: { campaignId, ...data },
    update: data,
  });

  await logActivity({
    actorId: userId,
    actionType: closed
      ? "PHASE2_VISIBILITY_CLOSED"
      : "PHASE2_VISIBILITY_OPENED",
    targetType: "Campaign",
    targetId: campaignId,
    campaignId,
    details: { surface },
  });
}

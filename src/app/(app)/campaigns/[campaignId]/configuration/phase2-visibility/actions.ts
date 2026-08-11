"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { getAdministratorId } from "@/lib/panel-authority";
import { setPhase2SurfaceClosed } from "@/lib/phase2-visibility-store";
import { PermissionKey } from "@/generated/prisma/enums";
import type { Phase2Surface } from "@/lib/phase2-visibility";

// The two Phase 2 read-visibility switches. Follows the same three rules as the
// other configuration actions — permission re-checked here rather than only
// hidden in the UI, scoped to the route's campaignId, and audited — with one
// addition: these are ADMINISTRATOR-ONLY, which is stricter than a permission.
//
// Why both checks. MANAGE_ACCOUNTS is what renders the section (matching
// CampaignLeadsSection next door), but it is a grantable permission: an
// Administrator could grant it to someone else, and that person would then be
// able to reveal every committee's notes. Who may set these is a question about
// holding the TM_LEAD title right now, not about a capability — the same
// distinction canViewMktSkills documents — so the title is checked too, live.

const SURFACES: readonly Phase2Surface[] = ["notes", "flags"];

function isSurface(value: string): value is Phase2Surface {
  return (SURFACES as readonly string[]).includes(value);
}

export type Phase2VisibilityResult = { ok: true } | { ok: false; error: string };

/**
 * Open or close one surface for one campaign.
 *
 * `closed` is passed explicitly rather than flipped from whatever is stored, so
 * two Administrators acting on a stale page can't toggle past each other — the
 * request states the intended end state, not a delta.
 */
export async function setPhase2Visibility(
  campaignId: string,
  surface: string,
  closed: boolean,
): Promise<Phase2VisibilityResult> {
  const actorId = await requirePermission(PermissionKey.MANAGE_ACCOUNTS);

  const administratorId = await getAdministratorId();
  if (administratorId !== actorId) {
    return {
      ok: false,
      error: "Only the Administrator can change Phase 2 visibility.",
    };
  }

  if (!isSurface(surface)) {
    return { ok: false, error: "Unknown Phase 2 surface." };
  }

  // The campaign must exist — a bad id from a crafted POST would otherwise
  // create an orphan config row against a campaign that was just deleted.
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!campaign) return { ok: false, error: "That campaign no longer exists." };

  await setPhase2SurfaceClosed({ campaignId, surface, closed, userId: actorId });

  revalidatePath(`/campaigns/${campaignId}/configuration`);
  // The Phase 2 page's whole entry payload depends on this, so its cached
  // render is now wrong for every viewer, not just the Administrator.
  revalidatePath(`/campaigns/${campaignId}/phase2`);
  return { ok: true };
}

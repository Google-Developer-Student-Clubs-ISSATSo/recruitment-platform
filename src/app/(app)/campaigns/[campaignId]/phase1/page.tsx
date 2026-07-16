import { requirePermission } from "@/lib/permissions";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";

// Placeholder — Phase 1 screening lands in a later stage. Scoped to the
// campaign in the route; guarded by SCREEN_PHASE1.
export default async function Phase1Page({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  await requirePermission(CAMPAIGN_PAGE_PERMISSIONS["phase1"], {
    redirectTo: `/campaigns/${campaignId}/dashboard?denied=1`,
  });

  return (
    <h1 className="text-2xl font-semibold text-foreground">Phase 1 Screening</h1>
  );
}

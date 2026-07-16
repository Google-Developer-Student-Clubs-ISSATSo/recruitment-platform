import { requirePermission } from "@/lib/permissions";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";

// Placeholder — interviews land in a later stage. Scoped to the campaign in the
// route; guarded by CLAIM_PANEL_SEAT.
export default async function InterviewsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  await requirePermission(CAMPAIGN_PAGE_PERMISSIONS["interviews"], {
    redirectTo: `/campaigns/${campaignId}/dashboard?denied=1`,
  });

  return <h1 className="text-2xl font-semibold text-foreground">Interviews</h1>;
}

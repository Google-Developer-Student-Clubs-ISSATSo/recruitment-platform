import { requirePermission } from "@/lib/permissions";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";

// Placeholder — final decisions land in a later stage. Scoped to the campaign
// in the route.
//
// ENTER_FINAL_DECISION now gates loading this page (read access). It replaced
// VIEW_COMMITTEE_DASHBOARD, which is a separate read-only committee view and no
// longer stands in for entering the final-decision screen.
export default async function FinalDecisionPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  await requirePermission(CAMPAIGN_PAGE_PERMISSIONS["final-decision"], {
    redirectTo: `/campaigns/${campaignId}/dashboard?denied=1`,
  });

  return (
    <h1 className="text-2xl font-semibold text-foreground">Final Decision</h1>
  );
}

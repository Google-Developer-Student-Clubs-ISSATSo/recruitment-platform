import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";

// Placeholder — full statistics land in a later stage. The one real number
// (applicant count) is scoped to THIS campaign, guarded by VIEW_STATISTICS.
export default async function StatisticsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  await requirePermission(CAMPAIGN_PAGE_PERMISSIONS["statistics"], {
    redirectTo: `/campaigns/${campaignId}/dashboard?denied=1`,
  });

  const applicantCount = await prisma.applicant.count({
    where: { campaignId },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Statistics</h1>
      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Total applicants
        </p>
        <p className="mt-1 text-3xl font-bold text-foreground">
          {applicantCount}
        </p>
      </div>
    </div>
  );
}

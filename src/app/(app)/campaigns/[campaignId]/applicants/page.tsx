import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";

// Applicant pool, scoped to this campaign. The Prisma query filters by the
// campaignId from the route param — the pool is never global. A user lacking
// VIEW_FULL_POOL is bounced back to this campaign's dashboard with a banner.
export default async function ApplicantsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  await requirePermission(CAMPAIGN_PAGE_PERMISSIONS["applicants"], {
    redirectTo: `/campaigns/${campaignId}/dashboard?denied=1`,
  });

  const applicants = await prisma.applicant.findMany({
    where: { campaignId },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      email: true,
      preferredCommittee: true,
      status: true,
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Applicants</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {applicants.length} applicant{applicants.length === 1 ? "" : "s"} in
          this campaign.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Preferred</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
            {applicants.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-10 text-center text-sm italic text-neutral-400"
                >
                  No applicants in this campaign yet.
                </td>
              </tr>
            ) : (
              applicants.map((a) => (
                <tr key={a.id}>
                  <td className="px-5 py-3 font-medium text-foreground">
                    {a.fullName}
                  </td>
                  <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                    {a.email}
                  </td>
                  <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                    {a.preferredCommittee}
                  </td>
                  <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                    {a.status}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

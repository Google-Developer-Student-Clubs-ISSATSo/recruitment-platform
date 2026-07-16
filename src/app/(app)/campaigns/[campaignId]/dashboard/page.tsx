import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Campaign dashboard. Reachable by anyone the campaign layout let in (an
// open-campaign worker, or a VIEW_CAMPAIGN_HISTORY holder viewing an archived
// one). Shows a scoped snapshot — the applicant count is filtered to THIS
// campaign, proving the per-campaign scoping.
export default async function CampaignDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ denied?: string }>;
}) {
  const { campaignId } = await params;
  const { denied } = await searchParams;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [user, applicantCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, committee: true },
    }),
    prisma.applicant.count({ where: { campaignId } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {denied === "1" && (
        <div className="rounded-lg border border-status-rejected/30 bg-status-rejected/10 px-4 py-3 text-sm font-medium text-status-rejected">
          You don&apos;t have access to that page.
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome, {user?.name ?? "Member"} — {user?.committee} committee
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          This is your dashboard for this campaign.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Applicants in this campaign
        </p>
        <p className="mt-1 text-3xl font-bold text-foreground">
          {applicantCount}
        </p>
      </div>
    </div>
  );
}

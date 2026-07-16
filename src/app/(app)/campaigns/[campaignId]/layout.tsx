import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasAnyPermission } from "@/lib/permissions";
import { Icon } from "@/components/app-shell/icon";
import {
  CAMPAIGN_ACCESS_PERMISSIONS,
  CAMPAIGN_HISTORY_PERMISSIONS,
} from "@/lib/route-permissions";

// Wraps every /campaigns/[campaignId]/* page. Runs the "does this campaign
// exist / may I enter it" check ONCE here so the individual pages don't repeat
// it — they only scope their own queries by the campaignId param.
//
//   - missing campaign        → notFound()
//   - closed (archived)       → requires VIEW_CAMPAIGN_HISTORY or MANAGE_ACCOUNTS
//   - open                    → requires any campaign-scoped permission
//
// A campaign-name breadcrumb links back to /campaigns so users are never
// stranded inside a single campaign. (The shell + sidebar come from the parent
// (app) layout; the sidebar reads the campaignId from the pathname.)
export default async function CampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, isOpen: true },
  });
  if (!campaign) notFound();

  const permitted = campaign.isOpen
    ? await hasAnyPermission(userId, CAMPAIGN_ACCESS_PERMISSIONS)
    : await hasAnyPermission(userId, CAMPAIGN_HISTORY_PERMISSIONS);

  if (!permitted) {
    redirect("/campaigns?denied=1");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/campaigns"
          className="flex items-center gap-1 text-neutral-500 transition-colors hover:text-primary dark:text-neutral-400"
        >
          <Icon name="arrow_back" className="text-[18px]" />
          All Campaigns
        </Link>
        <span className="text-neutral-300 dark:text-neutral-600">/</span>
        <span className="font-semibold text-foreground">{campaign.name}</span>
        {!campaign.isOpen && (
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300">
            Archived
          </span>
        )}
      </div>

      {children}
    </div>
  );
}

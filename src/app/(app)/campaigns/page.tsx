import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasAnyPermission } from "@/lib/permissions";
import {
  CAMPAIGN_ACCESS_PERMISSIONS,
  CAMPAIGN_CREATE_PERMISSIONS,
  CAMPAIGN_HISTORY_PERMISSIONS,
} from "@/lib/route-permissions";

import { CampaignList, type CampaignCard } from "./campaign-list";

type CampaignRow = {
  id: string;
  name: string;
  isOpen: boolean;
  createdAt: Date;
  _count: { applicants: number };
};

// Post-login landing page. Lists every campaign the current user is allowed to
// see:
//   - open campaigns → visible to anyone holding a campaign-scoped permission
//   - closed campaigns → visible only to VIEW_CAMPAIGN_HISTORY / MANAGE_ACCOUNTS
// Everyone else simply doesn't see the campaigns they can't enter.
export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [canAccessOpen, canSeeClosed, canCreate, campaigns] = await Promise.all(
    [
      hasAnyPermission(userId, CAMPAIGN_ACCESS_PERMISSIONS),
      hasAnyPermission(userId, CAMPAIGN_HISTORY_PERMISSIONS),
      hasAnyPermission(userId, CAMPAIGN_CREATE_PERMISSIONS),
      // The applicant count is shown on each row and, more importantly, spelled
      // out in the delete confirmation so nobody discards a pool blind.
      prisma.campaign.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { applicants: true } } },
      }),
    ],
  );

  const visible: CampaignCard[] = (campaigns as CampaignRow[])
    .filter((c) => (c.isOpen ? canAccessOpen : canSeeClosed))
    .map((c) => ({
      id: c.id,
      name: c.name,
      isOpen: c.isOpen,
      createdAtISO: c.createdAt.toISOString(),
      applicantCount: c._count.applicants,
    }));

  return (
    <CampaignList
      campaigns={visible}
      canManage={canCreate}
      denied={denied === "1"}
    />
  );
}

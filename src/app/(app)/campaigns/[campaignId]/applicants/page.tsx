import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";
import { ApplicantsView } from "./applicants-view";

// Applicant pool, scoped to this campaign. The Prisma query filters by the
// campaignId from the route param — the pool is never global. Read access is
// gated by VIEW_FULL_POOL; the CSV import action within is separately gated by
// IMPORT_APPLICANTS, so a viewer without it sees the list but no import button.
export default async function ApplicantsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const userId = await requirePermission(CAMPAIGN_PAGE_PERMISSIONS["applicants"], {
    redirectTo: `/campaigns/${campaignId}/dashboard?denied=1`,
  });

  const [applicants, canImport] = await Promise.all([
    prisma.applicant.findMany({
      where: { campaignId },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        email: true,
        preferredCommittee: true,
        isIssatsoStudent: true,
        status: true,
      },
    }),
    hasPermission(userId, PermissionKey.IMPORT_APPLICANTS),
  ]);

  return (
    <ApplicantsView
      campaignId={campaignId}
      applicants={applicants}
      canImport={canImport}
    />
  );
}

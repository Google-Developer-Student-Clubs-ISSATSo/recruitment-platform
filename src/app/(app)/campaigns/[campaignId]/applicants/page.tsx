import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  ApplicantStatus,
  Committee,
  PermissionKey,
} from "@/generated/prisma/enums";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";
import { ApplicantsView } from "./applicants-view";

/** Rows per page. Matches the activity log. */
const PAGE_SIZE = 10;

/** Only accept a value that is actually a member of the enum. */
function asEnum<T extends Record<string, string>>(
  e: T,
  value: string | undefined,
): T[keyof T] | null {
  if (!value) return null;
  return (Object.values(e) as string[]).includes(value)
    ? (value as T[keyof T])
    : null;
}

// Applicant pool, scoped to this campaign. The Prisma query filters by the
// campaignId from the route param — the pool is never global. Read access is
// gated by VIEW_FULL_POOL; the CSV import action within is separately gated by
// IMPORT_APPLICANTS, so a viewer without it sees the list but no import button.
//
// Search, filters and paging all live in the URL and are applied in the database
// rather than in the browser: the table is a paginated slice, so filtering it
// client-side would only ever filter the ten rows currently on screen.
export default async function ApplicantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
    committee?: string;
  }>;
}) {
  const { campaignId } = await params;
  const userId = await requirePermission(CAMPAIGN_PAGE_PERMISSIONS["applicants"], {
    redirectTo: `/campaigns/${campaignId}/dashboard?denied=1`,
  });

  const sp = await searchParams;
  const requestedPage = Math.max(1, Number(sp.page) || 1);
  const query = sp.q?.trim() ?? "";
  const status = asEnum(ApplicantStatus, sp.status);
  const committee = asEnum(Committee, sp.committee);

  // One `where` for both the row query and the count behind pageCount — if the
  // two disagreed you could page into a range the filtered set doesn't have.
  const where = {
    campaignId,
    ...(status ? { status } : {}),
    ...(committee ? { preferredCommittee: committee } : {}),
    ...(query
      ? {
          OR: [
            { fullName: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [
    applicants,
    matching,
    canImport,
    phaseOneConfig,
    totalCount,
    shortlistedCount,
    rejectedCount,
    presentStatusRows,
  ] = await Promise.all([
    prisma.applicant.findMany({
      where,
      orderBy: { fullName: "asc" },
      skip: (requestedPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        email: true,
        preferredCommittee: true,
        isIssatsoStudent: true,
        status: true,
      },
    }),
    prisma.applicant.count({ where }),
    hasPermission(userId, PermissionKey.IMPORT_APPLICANTS),
    // Feeds the "Target Quota" stat card — the club's intended intake, which is
    // configuration rather than anything derivable from the pool itself.
    prisma.phaseOneConfig.findUnique({
      where: { campaignId },
      select: { targetCount: true },
    }),
    // The stat cards are campaign-wide aggregates: scoped to the campaign only,
    // never to `where`. They must read the same whichever page you are on and
    // whatever is typed in the search box.
    prisma.applicant.count({ where: { campaignId } }),
    prisma.applicant.count({
      where: { campaignId, status: ApplicantStatus.SHORTLISTED },
    }),
    prisma.applicant.count({
      where: { campaignId, status: ApplicantStatus.REJECTED_PHASE1 },
    }),
    // Status options come from the whole campaign, not the current page —
    // otherwise the dropdown would gain and lose entries as you page.
    prisma.applicant.findMany({
      where: { campaignId },
      distinct: ["status"],
      select: { status: true },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  return (
    <ApplicantsView
      campaignId={campaignId}
      applicants={applicants}
      canImport={canImport}
      targetCount={phaseOneConfig?.targetCount ?? null}
      counts={{
        total: totalCount,
        shortlisted: shortlistedCount,
        rejected: rejectedCount,
      }}
      matching={matching}
      page={page}
      pageCount={pageCount}
      pageSize={PAGE_SIZE}
      presentStatuses={presentStatusRows.map((r) => r.status)}
      filters={{ q: query, status: sp.status ?? "", committee: sp.committee ?? "" }}
    />
  );
}

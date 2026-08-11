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

  // VIEW_FULL_POOL is what the answers dialog rests on — the same key whose
  // description promises "read their complete application answers", and the
  // same key that gates this page today, so this is true for anyone who gets
  // this far.
  //
  // Re-checked anyway, and used to decide whether `rawFormData` is SELECTED AT
  // ALL below, rather than merely whether the dialog renders. Two reasons:
  // the answers must never sit in the page payload for a viewer who isn't
  // entitled to them (hiding them client-side is not hiding them), and if this
  // page's gate is ever widened to "any of [...]" the way Phase 1's was, the
  // answers stay behind their own key instead of silently riding along.
  const canViewAnswers = await hasPermission(userId, PermissionKey.VIEW_FULL_POOL);

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
    answerQuestionRows,
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
        // Only for a holder of the permission that grants answers — see above.
        // Absent from the payload entirely otherwise, not blanked.
        ...(canViewAnswers ? { rawFormData: true } : {}),
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
    // The configured questions the answers dialog labels answers with. Exactly
    // the query the Phase 1 scoring page runs — same filter, same ordering, same
    // fields — because <ApplicantAnswerPanel> resolves each answer through
    // answerKey(question) and would otherwise be reading a different set of
    // questions than the Scoring Queue does for the same applicant.
    canViewAnswers
      ? prisma.phaseOneQuestion.findMany({
          where: { campaignId, isActive: true },
          orderBy: { order: "asc" },
          select: {
            id: true,
            text: true,
            requiresTechnicalScorer: true,
            sourceField: true,
          },
        })
      : Promise.resolve([]),
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
      canViewAnswers={canViewAnswers}
      answerQuestions={answerQuestionRows}
    />
  );
}

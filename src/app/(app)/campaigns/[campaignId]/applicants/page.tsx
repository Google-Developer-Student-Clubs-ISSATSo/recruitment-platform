import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  ApplicantStatus,
  Committee,
  PermissionKey,
} from "@/generated/prisma/enums";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";
import {
  tunisDateKey,
  tunisDayAnchor,
  tunisDayRange,
  formatTunisDayLabel,
} from "@/lib/tunis-time";
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
    /** "YYYY-MM-DD" Tunis calendar day the applicant submitted on. */
    day?: string;
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

  // `day` is a Tunis calendar day — the exact key tunisDateKey derives when
  // grouping the dropdown options below, so the filter can never disagree with
  // the days that dropdown offers. Only a well-formed key that parses into a
  // real range is honoured; anything else falls back to "no day filter".
  const submittedRange = sp.day ? tunisDayRange(sp.day) : null;

  // One `where` for both the row query and the count behind pageCount — if the
  // two disagreed you could page into a range the filtered set doesn't have.
  const where = {
    campaignId,
    ...(status ? { status } : {}),
    ...(committee ? { preferredCommittee: committee } : {}),
    ...(submittedRange
      ? { createdAt: { gte: submittedRange.start, lt: submittedRange.end } }
      : {}),
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
    submissionRows,
    answerQuestionRows,
  ] = await Promise.all([
    prisma.applicant.findMany({
      where,
      // Ordered by submission time, first submitted → last — the order the
      // form actually arrived in (name-order would obscure that). fullName is
      // a second key only to make same-instant ties (a CSV import assigns its
      // whole batch one createdAt) come out deterministic.
      orderBy: [{ createdAt: "asc" }, { fullName: "asc" }],
      skip: (requestedPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        email: true,
        preferredCommittee: true,
        isIssatsoStudent: true,
        status: true,
        createdAt: true,
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
    // Day options for the "Submitted on" dropdown — also campaign-wide, for the
    // same reason the status options are: a dropdown describing only the
    // current page's days would lose the very day you want to filter back to.
    prisma.applicant.findMany({
      where: { campaignId },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
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

  // Group submissions per Tunis calendar day, ascending — first day applicants
  // arrived first, matching the list's submission-time ordering.
  const dayCounts = new Map<string, number>();
  for (const row of submissionRows) {
    const key = tunisDateKey(row.createdAt);
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }
  const submittedDays = [...dayCounts.entries()].map(([value, count]) => {
    const anchor = tunisDayAnchor(value);
    return {
      value,
      count,
      label: anchor ? formatTunisDayLabel(anchor) : value,
    };
  });

  return (
    <ApplicantsView
      campaignId={campaignId}
      applicants={applicants.map((a) => ({
        ...a,
        // Serialized to ISO before the server→client boundary, matching the
        // rest of ApplicantRow's plain-JSON payload.
        createdAt: a.createdAt.toISOString(),
      }))}
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
      submittedDays={submittedDays}
      filters={{
        q: query,
        status: sp.status ?? "",
        committee: sp.committee ?? "",
        day: sp.day ?? "",
      }}
      canViewAnswers={canViewAnswers}
      answerQuestions={answerQuestionRows}
    />
  );
}

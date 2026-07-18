import Link from "next/link";

import { ApplicantStatus, Committee } from "@/generated/prisma/enums";
import { Icon } from "@/components/app-shell/icon";
import { StatusBadge } from "./status-badge";
import { ImportPanel } from "./import/import-panel";
import {
  ApplicantsFilters,
  type ApplicantFilters,
} from "./applicants-filters";

export type ApplicantRow = {
  id: string;
  fullName: string;
  email: string;
  preferredCommittee: Committee;
  isIssatsoStudent: boolean;
  status: ApplicantStatus;
};

/** At most this many numbered page links, windowed around the current page. */
const PAGE_WINDOW = 5;

// The applicants list: header + import action, stat cards, filter bar, and a
// paginated table with token-coloured status badges. Everything shown is decided
// server-side — this renders one page of an already-filtered query rather than
// filtering anything itself, so it is a plain server component.
export function ApplicantsView({
  campaignId,
  applicants,
  canImport,
  targetCount,
  counts,
  matching,
  page,
  pageCount,
  pageSize,
  presentStatuses,
  filters,
}: {
  campaignId: string;
  /** Just this page's rows. */
  applicants: ApplicantRow[];
  canImport: boolean;
  /** PhaseOneConfig.targetCount — null until Configuration sets one. */
  targetCount: number | null;
  /** Campaign-wide aggregates, independent of filters and paging. */
  counts: { total: number; shortlisted: number; rejected: number };
  /** How many rows match the current filters, across all pages. */
  matching: number;
  page: number;
  pageCount: number;
  pageSize: number;
  presentStatuses: ApplicantStatus[];
  filters: ApplicantFilters;
}) {
  const basePath = `/campaigns/${campaignId}/applicants`;
  const anyFilterActive = Boolean(
    filters.q || filters.status || filters.committee,
  );

  // Page links carry the active filters, or paging would silently clear them.
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status) params.set("status", filters.status);
    if (filters.committee) params.set("committee", filters.committee);
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const first = matching === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + applicants.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Applicants</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {counts.total} applicant{counts.total === 1 ? "" : "s"} in this
            campaign.
          </p>
        </div>
        {canImport && <ImportPanel campaignId={campaignId} />}
      </div>

      {/* Stat cards — campaign-wide totals from their own count queries, so they
          read the same on every page and under every filter. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Shortlisted" value={counts.shortlisted} tone="primary" />
        <StatCard
          label="Rejected (Phase 1)"
          value={counts.rejected}
          tone="rejected"
        />
        {/* The plan, not a headcount: how many the club intends to accept,
            straight from PhaseOneConfig. "—" until Configuration sets it. */}
        <StatCard label="Target Quota" value={targetCount ?? "—"} />
      </div>

      <ApplicantsFilters
        basePath={basePath}
        filters={filters}
        presentStatuses={presentStatuses}
      />

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Committee</th>
              <th className="px-5 py-3">ISSATSO</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
            {applicants.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-10 text-center text-sm italic text-neutral-400"
                >
                  {counts.total === 0
                    ? "No applicants in this campaign yet."
                    : "No applicants match your filters."}
                </td>
              </tr>
            ) : (
              applicants.map((a) => (
                <tr
                  key={a.id}
                  className="transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                >
                  <td className="px-5 py-3 font-medium text-foreground">
                    {a.fullName}
                  </td>
                  <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                    {a.email}
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded px-2 py-0.5 text-[10px] font-bold bg-primary/10 text-primary">
                      {a.preferredCommittee}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                    {a.isIssatsoStudent ? "Yes" : "No"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-5 py-3 dark:border-neutral-800 dark:bg-neutral-950/40">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            Showing {first}–{last} of {matching}
            {anyFilterActive ? " matching" : ""} applicant
            {matching === 1 ? "" : "s"}
          </span>
          {pageCount > 1 && (
            <Pagination page={page} pageCount={pageCount} pageHref={pageHref} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Every control is a real link to `?page=N`, so paging re-runs the server query
 * with a new skip/take. Prev/Next become inert spans at the ends — a disabled
 * <a> is still followable, so the element type changes, not just its styling.
 */
function Pagination({
  page,
  pageCount,
  pageHref,
}: {
  page: number;
  pageCount: number;
  pageHref: (n: number) => string;
}) {
  // Slide the window so the current page stays inside it, then clamp — near
  // either end the window shortens rather than running off.
  const windowStart = Math.max(
    1,
    Math.min(page - Math.floor(PAGE_WINDOW / 2), pageCount - PAGE_WINDOW + 1),
  );
  const windowEnd = Math.min(pageCount, windowStart + PAGE_WINDOW - 1);
  const pages = Array.from(
    { length: windowEnd - windowStart + 1 },
    (_, i) => windowStart + i,
  );

  const arrowClass =
    "flex size-8 items-center justify-center rounded border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800";
  const arrowDisabledClass =
    "flex size-8 items-center justify-center rounded border border-neutral-200 text-neutral-300 opacity-40 dark:border-neutral-800 dark:text-neutral-600";

  return (
    <div className="flex items-center gap-1">
      {page > 1 ? (
        <Link href={pageHref(page - 1)} aria-label="Previous page" className={arrowClass}>
          <Icon name="chevron_left" className="text-[20px]" />
        </Link>
      ) : (
        <span aria-hidden className={arrowDisabledClass}>
          <Icon name="chevron_left" className="text-[20px]" />
        </span>
      )}

      {pages.map((n) =>
        n === page ? (
          <span
            key={n}
            aria-current="page"
            className="flex size-8 items-center justify-center rounded bg-primary text-sm font-semibold text-white"
          >
            {n}
          </span>
        ) : (
          <Link
            key={n}
            href={pageHref(n)}
            aria-label={`Page ${n}`}
            className="flex size-8 items-center justify-center rounded border border-neutral-200 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {n}
          </Link>
        ),
      )}

      {page < pageCount ? (
        <Link href={pageHref(page + 1)} aria-label="Next page" className={arrowClass}>
          <Icon name="chevron_right" className="text-[20px]" />
        </Link>
      ) : (
        <span aria-hidden className={arrowDisabledClass}>
          <Icon name="chevron_right" className="text-[20px]" />
        </span>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  /** A string lets an unconfigured value render as "—" rather than 0. */
  value: number | string;
  tone?: "primary" | "rejected";
}) {
  const valueColor =
    tone === "primary"
      ? "text-primary"
      : tone === "rejected"
        ? "text-status-rejected"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}

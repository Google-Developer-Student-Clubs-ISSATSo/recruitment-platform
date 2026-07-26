"use client";

import { Pager } from "@/components/ui/pager";
import type { ApplicantFilters } from "./applicants-filters";

/**
 * Thin client-boundary adapter around the shared `<Pager>`.
 *
 * `ApplicantsView` (the caller) is a plain server component, and a Server
 * Component can never pass a function as a prop to a Client Component — only
 * plain serializable data crosses that boundary. `Pager`'s `pageHref` is a
 * function, so it cannot be built there and handed down; it has to be built
 * on this side instead, from `basePath` + `filters`, which ARE serializable.
 * This file's only job is that closure — all the actual pagination
 * rendering/windowing logic lives in `Pager`.
 */
export function Pagination({
  page,
  pageCount,
  basePath,
  filters,
}: {
  page: number;
  pageCount: number;
  basePath: string;
  /** Carried into every page link so paging preserves the active filters. */
  filters: ApplicantFilters;
}) {
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status) params.set("status", filters.status);
    if (filters.committee) params.set("committee", filters.committee);
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <Pager
      page={page}
      pageCount={pageCount}
      // total/pageSize/rowCount only feed the built-in summary text, which
      // this page renders itself (see the "Showing X–Y of Z" line in
      // applicants-view.tsx) — hideSummary means these three never render,
      // so the placeholder values below are inert.
      total={0}
      pageSize={1}
      rowCount={0}
      hideSummary
      pageHref={pageHref}
      layoutId="applicants-page-indicator"
    />
  );
}

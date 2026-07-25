"use client";

import Link from "next/link";
import { motion } from "motion/react";

import { Icon } from "@/components/app-shell/icon";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";
import type { ApplicantFilters } from "./applicants-filters";

/** At most this many numbered page links, windowed around the current page. */
const PAGE_WINDOW = 5;

/**
 * Build the href for page `n`, carrying the active filters — paging must not
 * silently clear them.
 *
 * Lives here rather than being passed in as a callback: this is a client
 * component, and a function prop cannot cross the server/client boundary (React
 * rejects it at serialization time). `basePath` and `filters` are plain
 * serializable values, so they cross fine and the URL is assembled on this side.
 */
function buildPageHref(
  basePath: string,
  filters: ApplicantFilters,
  n: number,
): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.committee) params.set("committee", filters.committee);
  if (n > 1) params.set("page", String(n));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Every control is a real link to `?page=N`, so paging re-runs the server query
 * with a new skip/take. Prev/Next become inert spans at the ends — a disabled
 * <a> is still followable, so the element type changes, not just its styling.
 *
 * The active-page highlight is a SHARED ELEMENT: one absolutely-positioned pill
 * with a `layoutId`, so when the page changes motion slides it from the old
 * number to the new one instead of having it blink out and reappear. That reads
 * as a position on a track, which is what a pager is. It survives paging because
 * Next's client-side navigation re-renders this component in place rather than
 * remounting it — the instance persists, so motion can see both positions.
 *
 * A client component purely for that animation; the links themselves are plain
 * hrefs and work identically without JS.
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
  const reduced = useReducedMotion();
  const pageHref = (n: number) => buildPageHref(basePath, filters, n);

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
    "flex size-8 items-center justify-center rounded border border-neutral-200 text-neutral-500 transition-colors duration-150 ease-out hover:bg-neutral-100 motion-reduce:transition-none dark:border-neutral-700 dark:hover:bg-neutral-800";
  const arrowDisabledClass =
    "flex size-8 items-center justify-center rounded border border-neutral-200 text-neutral-300 opacity-40 dark:border-neutral-800 dark:text-neutral-600";

  return (
    <div className="flex items-center gap-1">
      {page > 1 ? (
        <Link
          href={pageHref(page - 1)}
          aria-label="Previous page"
          className={arrowClass}
        >
          <Icon name="chevron_left" className="text-[20px]" />
        </Link>
      ) : (
        <span aria-hidden className={arrowDisabledClass}>
          <Icon name="chevron_left" className="text-[20px]" />
        </span>
      )}

      {pages.map((n) =>
        n === page ? (
          // relative + isolate so the sliding pill sits behind the digit rather
          // than over it.
          <span
            key={n}
            aria-current="page"
            className="relative isolate flex size-8 items-center justify-center rounded text-sm font-semibold text-white"
          >
            <motion.span
              aria-hidden
              layoutId="applicants-page-indicator"
              // layout animation off entirely under reduced motion: the pill
              // simply appears on the new number.
              layout={!reduced}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: DURATION.base, ease: EASE.inOut }
              }
              className="absolute inset-0 -z-10 rounded bg-primary"
            />
            {n}
          </span>
        ) : (
          <Link
            key={n}
            href={pageHref(n)}
            aria-label={`Page ${n}`}
            className="flex size-8 items-center justify-center rounded border border-neutral-200 text-sm text-neutral-500 transition-colors duration-150 ease-out hover:bg-neutral-100 motion-reduce:transition-none dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {n}
          </Link>
        ),
      )}

      {page < pageCount ? (
        <Link
          href={pageHref(page + 1)}
          aria-label="Next page"
          className={arrowClass}
        >
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

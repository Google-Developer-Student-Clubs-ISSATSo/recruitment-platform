"use client";

import Link from "next/link";
import { motion } from "motion/react";

import { Icon } from "@/components/app-shell/icon";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";

/** At most this many numbered page links, windowed around the current page. */
const DEFAULT_PAGE_WINDOW = 5;

/**
 * The single pager used everywhere in the app: tables paginated over a
 * client-held slice (Selection, Slot Entry — `onPageChange` swaps state) and
 * tables paginated by the server via `?page=N` (Applicants, Activity Log,
 * Permission Table — `pageHref` builds the URL). Both need the identical
 * windowing math and control layout; only how a page change is *triggered*
 * differs, so that's the one axis this component branches on rather than
 * forking into two components.
 *
 * `pageHref` mode renders real `<Link>`s (works with no JS, matches the
 * existing "disabled anchor is still followable" reasoning those pages
 * already relied on) with inert `<span>`s at the boundaries. `onPageChange`
 * mode renders `<button disabled>` at the boundaries instead, since there is
 * no href to make followable.
 *
 * The built-in summary line ("Showing X–Y of Z units") is what Selection and
 * Slot Entry rely on. Callers that already render their own summary
 * elsewhere (Applicants, Permission Table) pass `hideSummary`. Activity Log's
 * summary reads differently ("results", "X to Y") than the default, so it
 * passes `summary` to override the text without forking the control below it.
 */
type PagerNav =
  | { onPageChange: (n: number) => void; pageHref?: never }
  | { pageHref: (n: number) => string; onPageChange?: never };

type PagerProps = {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  /** Total rows across all pages (after any filtering). */
  total: number;
  pageSize: number;
  /** Rows actually rendered on this page. */
  rowCount: number;
  /** Singular noun for the built-in summary line, e.g. "applicant". */
  unit?: string;
  /** Suppress the built-in summary — the caller renders its own instead. */
  hideSummary?: boolean;
  /** Replace the built-in summary text without changing the controls. */
  summary?: React.ReactNode;
  /** How many numbered page links to show at once. Defaults to 5. */
  windowSize?: number;
  /**
   * Enables the animated shared-element pill under the active page number,
   * sliding between page numbers instead of blinking out and back in. Give
   * each pager on a page its own id so multiple pagers never collide.
   * Omitted → the plain static highlighted pill (the original behavior).
   */
  layoutId?: string;
} & PagerNav;

export function Pager({
  page,
  pageCount,
  total,
  pageSize,
  rowCount,
  unit = "row",
  hideSummary = false,
  summary,
  windowSize = DEFAULT_PAGE_WINDOW,
  layoutId,
  onPageChange,
  pageHref,
}: PagerProps) {
  const reduced = useReducedMotion();
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + rowCount;

  // Slide the window so the current page stays inside it, then clamp — near
  // either end the window shortens rather than running off.
  const windowStart = Math.max(
    1,
    Math.min(page - Math.floor(windowSize / 2), pageCount - windowSize + 1),
  );
  const windowEnd = Math.min(pageCount, windowStart + windowSize - 1);
  const pages = Array.from(
    { length: Math.max(0, windowEnd - windowStart + 1) },
    (_, i) => windowStart + i,
  );

  const arrowClass =
    "flex size-8 items-center justify-center rounded border border-neutral-200 text-neutral-500 transition-colors duration-150 ease-out hover:bg-neutral-100 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent motion-reduce:transition-none dark:border-neutral-700 dark:hover:bg-neutral-800";
  const arrowDisabledClass =
    "flex size-8 items-center justify-center rounded border border-neutral-200 text-neutral-300 opacity-40 dark:border-neutral-800 dark:text-neutral-600";
  const digitClass =
    "flex size-8 items-center justify-center rounded border border-neutral-200 text-sm text-neutral-500 transition-colors duration-150 ease-out hover:bg-neutral-100 motion-reduce:transition-none dark:border-neutral-700 dark:hover:bg-neutral-800";

  function ActivePage({ n }: { n: number }) {
    if (!layoutId) {
      return (
        <span
          aria-current="page"
          className="flex size-8 items-center justify-center rounded bg-primary text-sm font-semibold text-white"
        >
          {n}
        </span>
      );
    }
    // relative + isolate so the sliding pill sits behind the digit rather than
    // over it.
    return (
      <span
        aria-current="page"
        className="relative isolate flex size-8 items-center justify-center rounded text-sm font-semibold text-white"
      >
        <motion.span
          aria-hidden
          layoutId={layoutId}
          layout={!reduced}
          transition={
            reduced ? { duration: 0 } : { duration: DURATION.base, ease: EASE.inOut }
          }
          className="absolute inset-0 -z-10 rounded bg-primary"
        />
        {n}
      </span>
    );
  }

  const prev = page - 1;
  const next = page + 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-5 py-3 dark:border-neutral-800 dark:bg-neutral-950/40">
      {!hideSummary && (
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          {summary ?? (
            <>
              Showing {first}–{last} of {total} {unit}
              {total === 1 ? "" : "s"}
            </>
          )}
        </span>
      )}
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          {pageHref ? (
            page > 1 ? (
              <Link href={pageHref(prev)} aria-label="Previous page" className={arrowClass}>
                <Icon name="chevron_left" className="text-[20px]" />
              </Link>
            ) : (
              <span aria-hidden className={arrowDisabledClass}>
                <Icon name="chevron_left" className="text-[20px]" />
              </span>
            )
          ) : (
            <button
              type="button"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => onPageChange(prev)}
              className={arrowClass}
            >
              <Icon name="chevron_left" className="text-[20px]" />
            </button>
          )}

          {pages.map((n) =>
            n === page ? (
              <ActivePage key={n} n={n} />
            ) : pageHref ? (
              <Link key={n} href={pageHref(n)} aria-label={`Page ${n}`} className={digitClass}>
                {n}
              </Link>
            ) : (
              <button
                key={n}
                type="button"
                aria-label={`Page ${n}`}
                onClick={() => onPageChange(n)}
                className={digitClass}
              >
                {n}
              </button>
            ),
          )}

          {pageHref ? (
            page < pageCount ? (
              <Link href={pageHref(next)} aria-label="Next page" className={arrowClass}>
                <Icon name="chevron_right" className="text-[20px]" />
              </Link>
            ) : (
              <span aria-hidden className={arrowDisabledClass}>
                <Icon name="chevron_right" className="text-[20px]" />
              </span>
            )
          ) : (
            <button
              type="button"
              aria-label="Next page"
              disabled={page >= pageCount}
              onClick={() => onPageChange(next)}
              className={arrowClass}
            >
              <Icon name="chevron_right" className="text-[20px]" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

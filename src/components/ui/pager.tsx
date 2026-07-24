"use client";

import { Icon } from "@/components/app-shell/icon";

/** At most this many numbered page links, windowed around the current page. */
const PAGE_WINDOW = 5;

/**
 * Client-side pager for tables whose full dataset already lives in the browser
 * (client components with their own filtering/sorting or per-row state, where a
 * server `?page=N` round-trip would fight the existing client logic). Visually
 * mirrors the server-rendered pager used on Applicants / Activity Log — a
 * "Showing X–Y of Z" summary plus a windowed prev/numbers/next control — but
 * drives `onPageChange` instead of navigating.
 *
 * The caller is expected to only render this when there is more than one page;
 * it still guards internally so a single page shows just the summary.
 */
export function Pager({
  page,
  pageCount,
  total,
  pageSize,
  rowCount,
  unit = "row",
  onPageChange,
}: {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  /** Total rows across all pages (after any filtering). */
  total: number;
  pageSize: number;
  /** Rows actually rendered on this page. */
  rowCount: number;
  /** Singular noun for the summary line, e.g. "applicant". */
  unit?: string;
  onPageChange: (n: number) => void;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + rowCount;

  // Slide the window so the current page stays inside it, then clamp — near
  // either end the window shortens rather than running off.
  const windowStart = Math.max(
    1,
    Math.min(page - Math.floor(PAGE_WINDOW / 2), pageCount - PAGE_WINDOW + 1),
  );
  const windowEnd = Math.min(pageCount, windowStart + PAGE_WINDOW - 1);
  const pages = Array.from(
    { length: Math.max(0, windowEnd - windowStart + 1) },
    (_, i) => windowStart + i,
  );

  const arrowClass =
    "flex size-8 items-center justify-center rounded border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-100 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-700 dark:hover:bg-neutral-800";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-5 py-3 dark:border-neutral-800 dark:bg-neutral-950/40">
      <span className="text-sm text-neutral-500 dark:text-neutral-400">
        Showing {first}–{last} of {total} {unit}
        {total === 1 ? "" : "s"}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className={arrowClass}
          >
            <Icon name="chevron_left" className="text-[20px]" />
          </button>

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
              <button
                key={n}
                type="button"
                aria-label={`Page ${n}`}
                onClick={() => onPageChange(n)}
                className="flex size-8 items-center justify-center rounded border border-neutral-200 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                {n}
              </button>
            ),
          )}

          <button
            type="button"
            aria-label="Next page"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            className={arrowClass}
          >
            <Icon name="chevron_right" className="text-[20px]" />
          </button>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";

import { Icon } from "@/components/app-shell/icon";
import {
  actionTone,
  actionTypeLabel,
  splitTimestamp,
  type ActivityLogRow,
  type ActivitySummary,
  type ActivityTone,
} from "@/lib/activity-descriptions";

import { RefreshButton } from "./refresh-button";
import {
  ActivityLogFilters,
  type ActivityFilters,
  type ActorOption,
} from "./activity-log-filters";

// Pill colour per action tone, mapped onto the app's status/brand tokens.
const TONE_CLASS: Record<ActivityTone, string> = {
  accepted: "bg-status-accepted/10 text-status-accepted",
  rejected: "bg-status-rejected/10 text-status-rejected",
  pending: "bg-status-pending/15 text-[color:var(--status-pending)]",
  primary: "bg-primary/10 text-primary",
  neutral:
    "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400";

// Full activity-log screen rebuilt from the Stitch "activity_log" reference on
// the app's real Tailwind tokens. The Export CSV control from that reference is
// intentionally omitted. Both the filter bar and the pager are real: they drive
// the server query through the URL (?actor/?action/?from/?to/?page), so what you
// see is always a filtered, paginated database result rather than a client-side
// slice. Refresh re-fetches.
export function ActivityLogList({
  rows,
  total,
  summary,
  page,
  pageCount,
  pageSize,
  actorOptions,
  actionOptions,
  filters,
}: {
  rows: ActivityLogRow[];
  total: number;
  summary: ActivitySummary;
  /** 1-based, already clamped to [1, pageCount] by the page. */
  page: number;
  pageCount: number;
  pageSize: number;
  /** Derived from the whole log server-side, not from the current page. */
  actorOptions: ActorOption[];
  actionOptions: string[];
  /** Current filter values, echoed back from the URL. */
  filters: ActivityFilters;
}) {
  // Pagination links must carry the active filters, or paging would silently
  // drop them and jump back to the unfiltered log.
  const anyFilterActive =
    Boolean(filters.actor) ||
    Boolean(filters.action) ||
    Boolean(filters.from) ||
    Boolean(filters.to);

  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (filters.actor) params.set("actor", filters.actor);
    if (filters.action) params.set("action", filters.action);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return qs ? `/activity-log?${qs}` : "/activity-log";
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Page header */}
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Activity Log</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Audit trail for all administrative actions within the recruitment
            portal.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RefreshButton />
        </div>
      </section>

      {/* Analytics summary — above the filters and table, so the headline
          numbers are the first thing read rather than a footnote. */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <SummaryCard
          icon="trending_up"
          tint="bg-primary/10 text-primary"
          label="Actions Today"
          value={summary.actionsToday}
        />
        <SummaryCard
          icon="shield"
          tint="bg-status-rejected/10 text-status-rejected"
          label="Security Events"
          value={summary.securityEvents}
        />
        <SummaryCard
          icon="group"
          tint="bg-status-accepted/10 text-status-accepted"
          label="Most Active User"
          value={summary.mostActiveUser}
        />
      </section>

      <ActivityLogFilters
        filters={filters}
        actorOptions={actorOptions}
        actionOptions={actionOptions}
      />

      {/* Log table */}
      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-950/40">
          <span className={LABEL_CLASS}>
            Showing {total} {anyFilterActive ? "matching " : ""}activit{total === 1 ? "y" : "ies"}
          </span>
          <div className="flex items-center gap-1 text-neutral-400">
            <button
              type="button"
              aria-label="Filter columns"
              className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-neutral-100 hover:text-primary dark:hover:bg-neutral-800"
            >
              <Icon name="filter_list" className="text-[20px]" />
            </button>
            <button
              type="button"
              aria-label="Choose columns"
              className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-neutral-100 hover:text-primary dark:hover:bg-neutral-800"
            >
              <Icon name="view_column" className="text-[20px]" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-neutral-50 dark:bg-neutral-950/40">
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                {["Timestamp", "Actor", "Action Type", "Target", "Details"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-sm italic text-neutral-400"
                  >
                    {anyFilterActive
                      ? "No activity matches these filters."
                      : "No activity recorded yet."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const { date, time } = splitTimestamp(row.createdAtISO);
                  return (
                    <tr
                      key={row.id}
                      className="transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-950/40"
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-foreground">
                        {date}
                        <span className="ml-2 text-xs text-neutral-400">{time}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {initials(row.actorName)}
                          </span>
                          <span className="text-sm font-medium text-foreground">
                            {row.actorName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-bold uppercase tracking-tight ${TONE_CLASS[actionTone(row.actionType)]}`}
                        >
                          {actionTypeLabel(row.actionType)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">
                        {row.target}
                      </td>
                      <td className="px-6 py-4">
                        <div className="max-w-xs truncate text-sm text-neutral-500 dark:text-neutral-400">
                          {row.details || "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          pageHref={pageHref}
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          total={total}
          rowCount={rows.length}
        />
      </section>
    </div>
  );
}

/** At most this many numbered page links, windowed around the current page. */
const PAGE_WINDOW = 5;

/**
 * Server-rendered pager: every control is a real link to `?page=N`, so paging
 * re-runs the server query with a new skip/take rather than filtering rows in
 * the browser. Prev/Next become inert spans at the ends — a disabled <a> is
 * still followable, so the element type changes rather than just its styling.
 */
function Pagination({
  pageHref,
  page,
  pageCount,
  pageSize,
  total,
  rowCount,
}: {
  /** Builds a link to page n, carrying the active filters. */
  pageHref: (n: number) => string;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  rowCount: number;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + rowCount;

  // Slide the window so the current page stays inside it, then clamp to the
  // real range — near either end the window shortens rather than running off.
  const windowStart = Math.max(1, Math.min(page - Math.floor(PAGE_WINDOW / 2), pageCount - PAGE_WINDOW + 1));
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
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-950/40">
      <span className="text-sm text-neutral-500 dark:text-neutral-400">
        Showing {first} to {last} of {total} results
      </span>
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
    </div>
  );
}

function SummaryCard({
  icon,
  tint,
  label,
  value,
}: {
  icon: string;
  tint: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className={`flex size-12 items-center justify-center rounded-lg ${tint}`}>
        <Icon name={icon} className="text-[24px]" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          {label}
        </p>
        <p className="truncate text-xl font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

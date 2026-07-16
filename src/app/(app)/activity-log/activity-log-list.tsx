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

const FIELD_CLASS =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950";
const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400";

// Full activity-log screen rebuilt from the Stitch "activity_log" reference on
// the app's real Tailwind tokens. The Export CSV control from that reference is
// intentionally omitted. The filter bar and pager are presentational for now
// (data is fetched server-side, most-recent-first); Refresh re-fetches.
export function ActivityLogList({
  rows,
  total,
  summary,
}: {
  rows: ActivityLogRow[];
  total: number;
  summary: ActivitySummary;
}) {
  const actorOptions = [...new Set(rows.map((r) => r.actorName))].sort();
  const actionOptions = [...new Set(rows.map((r) => r.actionType))].sort();

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

      {/* Filters */}
      <section className="grid grid-cols-1 gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-member" className={LABEL_CLASS}>
            Member
          </label>
          <select id="filter-member" defaultValue="" className={FIELD_CLASS}>
            <option value="">All Members</option>
            {actorOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-action" className={LABEL_CLASS}>
            Action Type
          </label>
          <select id="filter-action" defaultValue="" className={FIELD_CLASS}>
            <option value="">All Actions</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>
                {actionTypeLabel(a)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label className={LABEL_CLASS}>Date Range</label>
          <div className="flex items-center gap-2">
            <input type="date" aria-label="From date" className={`${FIELD_CLASS} flex-1`} />
            <span className="text-sm text-neutral-500 dark:text-neutral-400">to</span>
            <input type="date" aria-label="To date" className={`${FIELD_CLASS} flex-1`} />
          </div>
        </div>
      </section>

      {/* Log table */}
      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-950/40">
          <span className={LABEL_CLASS}>Showing {total} activities</span>
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
                    No activity recorded yet.
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

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-950/40">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            Showing {rows.length === 0 ? 0 : 1} to {rows.length} of {total} results
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled
              aria-label="Previous page"
              className="flex size-8 items-center justify-center rounded text-neutral-400 disabled:opacity-40"
            >
              <Icon name="chevron_left" className="text-[20px]" />
            </button>
            <button
              type="button"
              aria-current="page"
              className="flex size-8 items-center justify-center rounded bg-primary text-sm font-semibold text-white"
            >
              1
            </button>
            <button
              type="button"
              disabled={rows.length >= total}
              aria-label="Next page"
              className="flex size-8 items-center justify-center rounded border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <Icon name="chevron_right" className="text-[20px]" />
            </button>
          </div>
        </div>
      </section>

      {/* Analytics summary */}
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

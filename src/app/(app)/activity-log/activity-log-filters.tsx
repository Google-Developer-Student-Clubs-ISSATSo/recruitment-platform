"use client";

import { useRouter } from "next/navigation";

import { actionTypeLabel } from "@/lib/activity-descriptions";

export type ActivityFilters = {
  /** Actor user id, or "" for all members. */
  actor: string;
  /** Raw actionType string, or "" for all actions. */
  action: string;
  /** yyyy-mm-dd, or "". */
  from: string;
  to: string;
};

export type ActorOption = { id: string; name: string };

const FIELD_CLASS =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950";
const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400";

/**
 * The filter bar. State lives in the URL rather than this component so that the
 * server query is the only thing that actually filters — the table is paginated
 * server-side, and filtering a single 10-row page in the browser would only ever
 * filter the slice you happen to be looking at.
 *
 * Every change resets `page`: after narrowing to three results, staying on page
 * 4 would show an empty table and look like the filter had broken.
 */
export function ActivityLogFilters({
  filters,
  actorOptions,
  actionOptions,
}: {
  filters: ActivityFilters;
  actorOptions: ActorOption[];
  actionOptions: string[];
}) {
  const router = useRouter();

  function apply(patch: Partial<ActivityFilters>) {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams();
    if (next.actor) params.set("actor", next.actor);
    if (next.action) params.set("action", next.action);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    // `page` is deliberately never carried over — see above.
    const qs = params.toString();
    router.push(qs ? `/activity-log?${qs}` : "/activity-log");
  }

  const anyActive =
    Boolean(filters.actor) ||
    Boolean(filters.action) ||
    Boolean(filters.from) ||
    Boolean(filters.to);

  return (
    <section className="grid grid-cols-1 gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="filter-member" className={LABEL_CLASS}>
          Member
        </label>
        <select
          id="filter-member"
          value={filters.actor}
          onChange={(e) => apply({ actor: e.target.value })}
          className={FIELD_CLASS}
        >
          <option value="">All Members</option>
          {actorOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="filter-action" className={LABEL_CLASS}>
          Action Type
        </label>
        <select
          id="filter-action"
          value={filters.action}
          onChange={(e) => apply({ action: e.target.value })}
          className={FIELD_CLASS}
        >
          <option value="">All Actions</option>
          {actionOptions.map((a) => (
            <option key={a} value={a}>
              {actionTypeLabel(a)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5 md:col-span-2">
        <div className="flex items-center justify-between">
          <span className={LABEL_CLASS}>Date Range</span>
          {anyActive && (
            <button
              type="button"
              onClick={() =>
                apply({ actor: "", action: "", from: "", to: "" })
              }
              className="text-[11px] font-semibold uppercase tracking-wider text-primary transition-colors hover:text-primary/80"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="From date"
            value={filters.from}
            onChange={(e) => apply({ from: e.target.value })}
            className={`${FIELD_CLASS} flex-1`}
          />
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            to
          </span>
          <input
            type="date"
            aria-label="To date"
            value={filters.to}
            onChange={(e) => apply({ to: e.target.value })}
            className={`${FIELD_CLASS} flex-1`}
          />
        </div>
      </div>
    </section>
  );
}

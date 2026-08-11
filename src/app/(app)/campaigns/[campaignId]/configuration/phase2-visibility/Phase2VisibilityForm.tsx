"use client";

import { useState, useTransition } from "react";

import { Icon, type IconName } from "@/components/app-shell/icon";
import { splitTimestamp } from "@/lib/activity-descriptions";
// From phase2.ts, not phase2-visibility.ts — see the note in that module.
import type { Phase2Surface } from "@/lib/phase2";
import { setPhase2Visibility } from "./actions";

type Row = {
  surface: Phase2Surface;
  label: string;
  icon: IconName;
  description: string;
  closed: boolean;
  closedAtISO: string | null;
  closedByName: string | null;
};

/**
 * The two switches, saved on change — the same no-separate-submit behaviour the
 * panel-size and scoring settings have.
 *
 * Each row states the CONSEQUENCE rather than the stored field: "Everyone can
 * read…" / "Only you and the matching committee lead…", because "notesClosedAt
 * is set" tells an Administrator nothing about who is affected. Reverted
 * locally if the server refuses, so the control can never sit showing a state
 * the database doesn't have.
 */
export function Phase2VisibilityForm({
  campaignId,
  rows: initialRows,
}: {
  campaignId: string;
  rows: Row[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(surface: Phase2Surface, nextClosed: boolean) {
    const previous = rows;
    setRows((rs) =>
      rs.map((r) => (r.surface === surface ? { ...r, closed: nextClosed } : r)),
    );
    setError(null);

    startTransition(async () => {
      const result = await setPhase2Visibility(campaignId, surface, nextClosed);
      if (!result.ok) {
        setRows(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="mt-5 space-y-3">
      <fieldset disabled={pending} className="space-y-3">
        <legend className="sr-only">Phase 2 visibility</legend>

        {rows.map((row) => {
          const closedStamp =
            row.closed && row.closedAtISO
              ? splitTimestamp(row.closedAtISO)
              : null;

          return (
            <label
              key={row.surface}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors duration-150 ease-out motion-reduce:transition-none ${
                row.closed
                  ? "border-[color:var(--status-pending)]/40 bg-[color:var(--status-pending)]/5"
                  : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
              }`}
            >
              <input
                type="checkbox"
                checked={!row.closed}
                onChange={(e) => toggle(row.surface, !e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[color:var(--color-primary)]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Icon name={row.icon} className="text-[16px]" />
                  {row.label}
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      row.closed
                        ? "bg-[color:var(--status-pending)]/15 text-[color:var(--status-pending)]"
                        : "bg-status-accepted/10 text-status-accepted"
                    }`}
                  >
                    {row.closed ? "Restricted" : "Open"}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
                  {row.description}
                </span>
                {closedStamp && (
                  <span className="mt-1 block text-[11px] text-neutral-400">
                    Restricted by {row.closedByName ?? "an administrator"} ·{" "}
                    {closedStamp.date}, {closedStamp.time.slice(0, 5)}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </fieldset>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Restricting hides the column entirely for everyone else — it never
        affects you, the matching committee lead, or anyone&rsquo;s ability to
        add a note or flag.
      </p>

      {error && (
        <p className="rounded-lg bg-status-rejected/10 px-3 py-2 text-xs text-status-rejected">
          {error}
        </p>
      )}
    </div>
  );
}

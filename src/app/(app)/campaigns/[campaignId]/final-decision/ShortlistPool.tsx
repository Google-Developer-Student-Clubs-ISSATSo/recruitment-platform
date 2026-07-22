"use client";

import { Committee } from "@/generated/prisma/enums";
import { CAPACITY_COMMITTEES } from "@/lib/committee-capacity";
import {
  compareForPool,
  formatScore,
  interviewAverage,
  type DecisionRow,
  type FinalDecision,
} from "@/lib/final-decision";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app-shell/icon";

// The waitlist pass, run after the main pass: everyone still PENDING, best
// interview first, so capacity that frees up gets filled from the top down.
//
// Compact by design — one row per person with the two actions that matter. The
// full one-applicant panel is the main tab's job; this view exists to move
// several people quickly.
export function ShortlistPool({
  rows,
  committeeFor,
  onCommitteeChange,
  onDecide,
  pending,
}: {
  rows: DecisionRow[];
  committeeFor: (row: DecisionRow) => Committee;
  onCommitteeChange: (applicantId: string, committee: Committee) => void;
  onDecide: (row: DecisionRow, decision: FinalDecision) => void;
  pending: boolean;
}) {
  const ranked = [...rows].sort(compareForPool);

  if (ranked.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center dark:border-neutral-700 dark:bg-neutral-900/40">
        <p className="text-base font-medium text-foreground">
          Nobody is on the shortlist.
        </p>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Applicants you shortlist during the main pass land here, ranked by
          interview score, ready to fill capacity that frees up.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="overflow-x-auto">
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left dark:border-neutral-800 dark:bg-neutral-800/40">
              <th className="w-14 px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                #
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                Name
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                Interview
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                Form
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                Committee
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row, index) => {
              const avg = interviewAverage(row);
              return (
                <tr
                  key={row.id}
                  className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60"
                >
                  <td className="px-4 py-3 text-sm font-semibold tabular-nums text-neutral-400">
                    {index + 1}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-foreground">
                      {row.fullName}
                    </span>
                    {row.yearOfStudy && (
                      <span className="ml-2 text-sm text-neutral-500 dark:text-neutral-400">
                        {row.yearOfStudy}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {avg === null ? (
                      <span className="text-sm text-neutral-400">
                        Not interviewed
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-status-accepted/10 px-2.5 py-0.5 font-semibold tabular-nums text-status-accepted">
                        {formatScore(avg)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium tabular-nums text-neutral-600 dark:text-neutral-300">
                    {formatScore(row.formScore, 2)}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Committee for ${row.fullName}`}
                      value={committeeFor(row)}
                      disabled={pending}
                      onChange={(e) =>
                        onCommitteeChange(row.id, e.target.value as Committee)
                      }
                      className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm text-foreground dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      {CAPACITY_COMMITTEES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => onDecide(row, "ACCEPT")}
                        className="bg-status-accepted text-white hover:bg-status-accepted/85 dark:text-neutral-950"
                      >
                        <Icon name="check" className="text-[16px]" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={pending}
                        onClick={() => onDecide(row, "REJECT")}
                      >
                        <Icon name="close" className="text-[16px]" />
                        Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

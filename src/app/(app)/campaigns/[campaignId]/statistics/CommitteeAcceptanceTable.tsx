import { committeeLabel } from "@/lib/committee";
import { getCapacityUsage } from "@/lib/committee-capacity-store";
import { capacityLevel } from "@/lib/final-decision";

// How full each committee is, as a table.
//
// The numbers come from getCapacityUsage — the exact loader behind the Final
// Decision page's capacity bar and the dashboard's capacity widget — rather
// than a second accepted-vs-target computation here. Three screens, one query,
// so they cannot disagree.
//
// Tabular figures throughout: these columns align vertically, which is the one
// place equal-width digits help.
const LEVEL_TEXT = {
  under: "text-foreground",
  at: "text-status-accepted",
  over: "text-status-rejected",
} as const;

const LEVEL_FILL = {
  under: "bg-primary",
  at: "bg-status-accepted",
  over: "bg-status-rejected",
} as const;

export async function CommitteeAcceptanceTable({
  campaignId,
}: {
  campaignId: string;
}) {
  const usage = await getCapacityUsage(campaignId);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <h2 className="text-lg font-semibold text-foreground">
          Acceptance Rate per Committee
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Accepted against the seats each committee was recruiting for.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-neutral-200 dark:border-neutral-800">
            <tr>
              <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Committee
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Accepted
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Target
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Filled
              </th>
              <th className="w-40 px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {usage.map(({ committee, accepted, target }) => {
              const level = capacityLevel(accepted, target);
              // A zero target means "no seats", which any acceptance overfills,
              // so the rate reads as full rather than dividing by zero.
              const filled =
                target <= 0 ? (accepted > 0 ? 1 : 0) : accepted / target;
              return (
                <tr key={committee}>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-foreground">
                      {committee}
                    </span>
                    <span className="ml-2 text-sm text-neutral-500 dark:text-neutral-400">
                      {committeeLabel(committee)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-foreground">
                    {accepted}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-neutral-500 dark:text-neutral-400">
                    {target}
                  </td>
                  <td
                    className={`px-6 py-4 text-right font-bold tabular-nums ${LEVEL_TEXT[level]}`}
                  >
                    {Math.round(filled * 100)}%
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                      <div
                        className={`h-full rounded-full ${LEVEL_FILL[level]}`}
                        style={{ width: `${Math.min(100, filled * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

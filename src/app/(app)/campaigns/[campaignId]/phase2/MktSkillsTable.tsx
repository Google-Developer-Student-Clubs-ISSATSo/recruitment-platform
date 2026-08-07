import { Icon } from "@/components/app-shell/icon";
import { type SkillCount } from "@/lib/phase2";

/**
 * MKT-relevant skills across everyone who passed Phase 1 — per-skill counts,
 * nothing else.
 *
 * The rows are exactly the campaign's configured whitelist (Configuration →
 * MKT Skills), counted live on every page load, so they cannot drift from the
 * applicant rows behind them and a whitelist edit lands on the next load.
 *
 * The TABLE is deliberately not filtered to MKT applicants — the whole point is
 * to find people who can already do marketing work whatever committee they
 * picked. The MKT-preference figure in the header is the one MKT-only number,
 * kept out of the rows so it can't be misread as a skill count.
 */
export function MktSkillsTable({
  skills,
  mktPreferredCount,
}: {
  skills: SkillCount[];
  /**
   * Of the same population, how many chose MKT AND listed at least one skill
   * from this campaign's list.
   */
  mktPreferredCount: number;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-4 sm:px-6 dark:border-neutral-800">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Icon name="bar_chart" className="text-[20px] text-primary" />
          MKT Skills Breakdown
        </h2>
        {/* Deliberately spelled out rather than shortened to "chose MKT": the
            figure counts MKT-preferring applicants who ALSO listed a skill from
            the list below, and a label naming only half of that is how it got
            misread the first time. */}
        <p className="flex items-baseline gap-2 rounded-lg bg-primary/10 px-3 py-1.5">
          <span className="text-lg font-bold tabular-nums text-primary">
            {mktPreferredCount}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            chose MKT with a listed skill
          </span>
        </p>
      </div>

      {skills.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-neutral-500 sm:px-6 dark:text-neutral-400">
          Nobody who passed Phase 1 listed a skill from this campaign&rsquo;s MKT
          skills list. Configuration → MKT Skills sets which skills count.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 sm:px-6 dark:text-neutral-400">
                  Skill
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500 sm:px-6 dark:text-neutral-400">
                  Applicants
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {skills.map((s) => (
                <tr key={s.skill}>
                  <td className="px-4 py-3 text-sm font-medium text-foreground sm:px-6">
                    {s.skill}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-foreground sm:px-6">
                    {s.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

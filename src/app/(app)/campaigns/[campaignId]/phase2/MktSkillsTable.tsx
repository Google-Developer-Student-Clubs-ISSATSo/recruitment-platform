import { Icon } from "@/components/app-shell/icon";
import { MKT_SOFT_SKILLS, type SkillCount } from "@/lib/phase2";

/**
 * MKT-relevant skills across everyone who passed Phase 1 — raw per-skill counts,
 * nothing else.
 *
 * Two things this deliberately is NOT:
 *   - It is not filtered to MKT applicants. The whole point is to find the
 *     people who can already do marketing work whatever committee they picked,
 *     so the population is the full passed-Phase-1 list.
 *   - It is not a category rollup. No "Design (total)" row — raw counts per
 *     distinct skill value, per the scope decision.
 *
 * The counts are computed live on every page load (tallyMktSkills), never
 * stored, so they cannot drift from the applicant rows behind them.
 */
export function MktSkillsTable({
  skills,
  applicantCount,
}: {
  skills: SkillCount[];
  /** Size of the population the counts are drawn from, for the caption. */
  applicantCount: number;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-neutral-200 px-4 py-4 sm:px-6 dark:border-neutral-800">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Icon name="bar_chart" className="text-[20px] text-primary" />
          MKT Skills Breakdown
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Marketing-relevant skills listed by the {applicantCount} applicant
          {applicantCount === 1 ? "" : "s"} who passed Phase 1 — every committee,
          not just MKT. Counts the &ldquo;Other skills&rdquo; answers plus{" "}
          {MKT_SOFT_SKILLS.join(" and ")} from &ldquo;Soft skills&rdquo;.
        </p>
      </div>

      {skills.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-neutral-500 sm:px-6 dark:text-neutral-400">
          Nobody who passed Phase 1 listed an MKT-relevant skill.
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

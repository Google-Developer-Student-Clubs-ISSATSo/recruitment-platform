import { Icon } from "@/components/app-shell/icon";
import { committeeLabel } from "@/lib/committee";
import { type SkillCount } from "@/lib/phase2";
import type { MktSkillApplicant } from "@/lib/phase2-store";

const SUBHEADING_CLASS =
  "px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 sm:px-6 dark:text-neutral-400";

/**
 * MKT-relevant skills across everyone who passed Phase 1 — who has them, then
 * how many have each.
 *
 * The two tables are the same population read two ways: the detail table names
 * the people, the aggregate below counts them. Detail comes first because the
 * counts only mean something once you can see who they are made of, and because
 * acting on this section means contacting a person, not a number.
 *
 * Restricted to VIEW_MKT_SKILLS_BREAKDOWN holders (see canViewMktSkills in
 * lib/phase2-store.ts) — the page around it stays open to everyone.
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
  applicants,
  mktPreferredCount,
}: {
  skills: SkillCount[];
  /**
   * Everyone with at least one matched skill, ranked-list order. Same set the
   * counts are computed from — see getPhase2Data.
   */
  applicants: MktSkillApplicant[];
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
        <>
          {/* Who they are. Ranked-list order, so someone found here can be
              located in the list above without re-sorting anything. */}
          <h3 className={SUBHEADING_CLASS}>Applicants with a listed skill</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 sm:px-6 dark:text-neutral-400">
                    Applicant
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 sm:px-6 dark:text-neutral-400">
                    Preferred Committee
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 sm:px-6 dark:text-neutral-400">
                    Matched Skills
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {applicants.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 text-sm font-medium text-foreground sm:px-6">
                      {a.fullName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-600 sm:px-6 dark:text-neutral-300">
                      {committeeLabel(a.preferredCommittee)}
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      {/* One chip per skill rather than a comma-joined string:
                          an applicant can match several, and the chips make the
                          count of them readable at a glance. */}
                      <span className="flex flex-wrap gap-1.5">
                        {a.skills.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
                          >
                            {skill}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* How many have each — unchanged from before the detail table
              existed, and still the same population it always counted. */}
          <h3
            className={`${SUBHEADING_CLASS} border-t border-neutral-200 dark:border-neutral-800`}
          >
            Per-skill totals
          </h3>
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
        </>
      )}
    </section>
  );
}

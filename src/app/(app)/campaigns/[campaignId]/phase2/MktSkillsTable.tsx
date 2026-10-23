import { Icon } from "@/components/app-shell/icon";
import { type SkillCount } from "@/lib/phase2";
import type { MktSkillApplicant } from "@/lib/phase2-store";
import { Committee } from "@/generated/prisma/enums";
import { MktSkillsCharts } from "./MktSkillsCharts";
import { SkillChips } from "./SkillChips";

const SUBHEADING_CLASS =
  "px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 sm:px-6 dark:text-neutral-400";

/**
 * MKT-relevant skills across everyone who passed Phase 1 — how many have each,
 * then who they are.
 *
 * The charts and the table are the same population read two ways: the charts
 * count, the table names the people. A per-skill totals table used to sit below
 * this one and was dropped as a repeat of the "Applicants per skill" chart,
 * whose tooltip carries each exact count.
 *
 * Restricted to VIEW_MKT_SKILLS_BREAKDOWN holders (see canViewMktSkills in
 * lib/phase2-store.ts) — the page around it stays open to everyone.
 *
 * The rows are the campaign's configured whitelist (Configuration → MKT
 * Skills) plus whatever applicants wrote into the form's "Other:" box, marked
 * as write-ins. All counted live on every page load, so they cannot drift from
 * the applicant rows behind them and a whitelist edit lands on the next load.
 *
 * The CHARTS cover everyone, whatever committee they picked — the committee
 * chart exists to compare them. The TABLE lists only applicants who chose MKT:
 * skilled applicants from other committees have their own section below
 * (<MktSkillsOutsideMkt>), so listing them here too only repeated them. With
 * every row MKT, the table has no committee column.
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
  const mktApplicants = applicants.filter(
    (a) => a.preferredCommittee === Committee.MKT,
  );

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
          <span className="text-lg font-bold tabular-nums text-primary-text">
            {mktPreferredCount}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-primary-text">
            chose MKT with a listed skill
          </span>
        </p>
      </div>

      {skills.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-neutral-500 sm:px-6 dark:text-neutral-400">
          Nobody who passed Phase 1 answered the Other skills question.
          Configuration → MKT Skills sets which options count as listed skills.
        </p>
      ) : (
        <>
          <MktSkillsCharts skills={skills} applicants={applicants} />
          {/* Who they are. Ranked-list order, so someone found here can be
              located in the list above without re-sorting anything. */}
          <h3 className={SUBHEADING_CLASS}>MKT applicants with a skill</h3>
          {mktApplicants.length === 0 ? (
            <p className="px-4 pb-6 pt-2 text-sm text-neutral-500 sm:px-6 dark:text-neutral-400">
              Nobody who chose MKT listed a skill.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 sm:px-6 dark:text-neutral-400">
                      Applicant
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 sm:px-6 dark:text-neutral-400">
                      Skills
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {mktApplicants.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 text-sm font-medium text-foreground sm:px-6">
                        {a.fullName}
                      </td>
                      <td className="px-4 py-3 sm:px-6">
                        <SkillChips listed={a.skills} writeIns={a.writeIns} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

import { Icon } from "@/components/app-shell/icon";
import { committeeLabel } from "@/lib/committee";
import type { MktSkillApplicant } from "@/lib/phase2-store";
import { Committee } from "@/generated/prisma/enums";
import { SkillChips } from "./SkillChips";

const TH_CLASS =
  "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 sm:px-6 dark:text-neutral-400";

/**
 * Marketing talent that applied elsewhere: everyone who ticked at least one
 * whitelisted MKT skill but chose TM or EER as their preferred committee —
 * people the MKT committee may want to give the marketing test anyway.
 *
 * Whitelisted skills are the bar, not write-ins: a write-in is whatever someone
 * typed, so on its own it can't say "this person can do MKT work". Their
 * write-ins still show beside the listed ones for context.
 *
 * Built from the same mktSkillApplicants rows as the breakdown above, so the
 * two can never disagree about who has which skill. Rendered under the same
 * VIEW_MKT_SKILLS_BREAKDOWN gate as the breakdown.
 *
 * Ordered by how many MKT skills they listed, most first — the section exists
 * to spot the strongest candidates — with the ranked-list position as the
 * tiebreak and shown in its own column, so each person can be found in the
 * list above.
 */
export function MktSkillsOutsideMkt({
  applicants,
}: {
  applicants: MktSkillApplicant[];
}) {
  const outside = applicants
    .filter(
      (a) => a.preferredCommittee !== Committee.MKT && a.skills.length > 0,
    )
    .sort(
      (x, y) => y.skills.length - x.skills.length || x.position - y.position,
    );

  return (
    <section className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-4 sm:px-6 dark:border-neutral-800">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Icon name="campaign" className="text-[20px] text-primary" />
            MKT Skills Outside MKT
          </h2>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            Listed at least one MKT skill, but chose another committee.
          </p>
        </div>
        <p className="flex items-baseline gap-2 rounded-lg bg-primary/10 px-3 py-1.5">
          <span className="text-lg font-bold tabular-nums text-primary">
            {outside.length}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            applicant{outside.length === 1 ? "" : "s"}
          </span>
        </p>
      </div>

      {outside.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-neutral-500 sm:px-6 dark:text-neutral-400">
          Everyone who listed an MKT skill chose MKT.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className={`${TH_CLASS} w-16`}>Rank</th>
                <th className={TH_CLASS}>Applicant</th>
                <th className={TH_CLASS}>Preferred Committee</th>
                <th className={TH_CLASS}>Skills</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {outside.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 text-sm font-semibold tabular-nums text-neutral-500 sm:px-6 dark:text-neutral-400">
                    {a.position}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground sm:px-6">
                    {a.fullName}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-600 sm:px-6 dark:text-neutral-300">
                    {committeeLabel(a.preferredCommittee)}
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
    </section>
  );
}

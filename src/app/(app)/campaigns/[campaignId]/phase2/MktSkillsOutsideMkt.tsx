import { Icon } from "@/components/app-shell/icon";
import { COMMITTEE_LABEL, committeeLabel } from "@/lib/committee";
import type { MktSkillApplicant } from "@/lib/phase2-store";
import { Committee } from "@/generated/prisma/enums";
import { SkillChips } from "./SkillChips";

const TH_CLASS =
  "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 sm:px-6 dark:text-neutral-400";

// The committees' one fixed order (COMMITTEE_LABEL's), minus MKT itself — the
// whole section is about people who didn't choose it.
const OTHER_COMMITTEES = (Object.keys(COMMITTEE_LABEL) as Committee[]).filter(
  (c) => c !== Committee.MKT,
);

/**
 * Marketing talent that applied elsewhere: everyone who ticked at least one
 * whitelisted MKT skill but chose another committee as their preferred one —
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
 * Listed separately per preferred committee, in the fixed committee order;
 * a committee nobody qualifies from is left out. Within each, most MKT skills
 * first — the section exists to spot the strongest candidates — then by
 * ranked-list position, which is only a stable tiebreak and isn't shown.
 */
export function MktSkillsOutsideMkt({
  applicants,
}: {
  applicants: MktSkillApplicant[];
}) {
  const groups = OTHER_COMMITTEES.map((committee) => ({
    committee,
    rows: applicants
      .filter((a) => a.preferredCommittee === committee && a.skills.length > 0)
      .sort(
        (x, y) =>
          y.skills.length - x.skills.length || x.position - y.position,
      ),
  })).filter((g) => g.rows.length > 0);

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

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
          <span className="text-lg font-bold tabular-nums text-primary-text">
            {total}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-primary-text">
            applicant{total === 1 ? "" : "s"}
          </span>
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-neutral-500 sm:px-6 dark:text-neutral-400">
          Everyone who listed an MKT skill chose MKT.
        </p>
      ) : (
        groups.map(({ committee, rows }, i) => (
          <div
            key={committee}
            className={
              i > 0 ? "border-t border-neutral-200 dark:border-neutral-800" : ""
            }
          >
            <h3 className="flex items-center gap-2 px-4 pt-4 pb-2 text-sm font-semibold text-foreground sm:px-6">
              {committeeLabel(committee)}
              <span className="font-normal text-neutral-500 dark:text-neutral-400">
                · {rows.length}
              </span>
            </h3>
            <div className="overflow-x-auto">
              {/* table-fixed + the same <colgroup> in every group: each
                  committee is its own table, and auto layout sized each one's
                  columns from its own names, so the Skills column started at a
                  different x in the TM and EER tables. Fixed widths line them
                  up regardless of content. */}
              <table className="w-full table-fixed text-left">
                <colgroup>
                  <col className="w-[40%]" />
                  <col />
                </colgroup>
                <thead className="border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className={TH_CLASS}>Applicant</th>
                    <th className={TH_CLASS}>Skills</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td className="break-words px-4 py-3 text-sm font-medium text-foreground sm:px-6">
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
          </div>
        ))
      )}
    </section>
  );
}

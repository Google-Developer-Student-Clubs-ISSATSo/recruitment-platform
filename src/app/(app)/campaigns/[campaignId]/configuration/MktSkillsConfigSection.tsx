import { Icon } from "@/components/app-shell/icon";
import { getMktSkillWhitelist } from "@/lib/mkt-skills-store";
import { MktSkillsForm } from "./mkt-skills/MktSkillsForm";

// Server data-loader for the campaign's MKT skill whitelist. Rendered only for
// CONFIGURE_SCREENING holders (the <PermissionGate> in page.tsx) — the same
// permission that gates the Phase 1 scoring configuration next to it, since
// both decide how submitted answers are read rather than who is accepted; the
// add/remove actions re-check it themselves.
export async function MktSkillsConfigSection({
  campaignId,
}: {
  campaignId: string;
}) {
  const skills = await getMktSkillWhitelist(campaignId);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="bar_chart" className="text-[22px]" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">MKT Skills</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Which submitted skills count toward the Phase 2 MKT Skills
            Breakdown. Adding one credits every applicant who already listed it.
          </p>
        </div>
      </div>

      <MktSkillsForm campaignId={campaignId} skills={skills} />
    </section>
  );
}

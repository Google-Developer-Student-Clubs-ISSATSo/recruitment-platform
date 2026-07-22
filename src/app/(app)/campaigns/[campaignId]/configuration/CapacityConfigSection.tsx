import { Icon } from "@/components/app-shell/icon";
import { getCapacityTargets } from "@/lib/committee-capacity-store";
import { CapacityForm } from "./capacity/CapacityForm";

// Server data-loader for per-committee intake capacity. Rendered only for
// MANAGE_CAPACITY holders (the <PermissionGate> in page.tsx); the save action
// re-checks that permission itself. The targets read here are the numbers the
// Final Decision dashboard compares its live accepted counts against.
export async function CapacityConfigSection({
  campaignId,
}: {
  campaignId: string;
}) {
  const targets = await getCapacityTargets(campaignId);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="groups" className="text-[22px]" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Committee Capacity
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Set how many applicants each committee can take on this campaign.
          </p>
        </div>
      </div>

      <CapacityForm campaignId={campaignId} initialTargets={targets} />
    </section>
  );
}

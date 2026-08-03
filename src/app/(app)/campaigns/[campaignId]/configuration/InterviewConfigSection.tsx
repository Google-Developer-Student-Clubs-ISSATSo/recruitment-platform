import { Icon } from "@/components/app-shell/icon";
import { getPanelSize } from "@/lib/interview-config";
import { PanelSizeForm } from "./interviews/PanelSizeForm";

// Server data-loader for the per-campaign interview settings. Rendered only for
// MANAGE_CAPACITY holders (the <PermissionGate> in page.tsx); the save action
// re-checks that permission itself.
export async function InterviewConfigSection({
  campaignId,
}: {
  campaignId: string;
}) {
  const panelSize = await getPanelSize(campaignId);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="event_seat" className="text-[22px]" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Interviews</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            How many interviewers sit on each panel this campaign.
          </p>
        </div>
      </div>

      <PanelSizeForm campaignId={campaignId} initialPanelSize={panelSize} />
    </section>
  );
}

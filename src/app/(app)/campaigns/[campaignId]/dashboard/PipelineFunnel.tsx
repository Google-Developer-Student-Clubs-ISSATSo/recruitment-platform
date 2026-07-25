import { getPipelineFunnel } from "@/lib/campaign-dashboard";
import { FunnelBar } from "./FunnelBar";
import { WidgetPanel } from "./WidgetPanel";

// The recruitment pipeline as four horizontal bars. Rendered only for
// VIEW_STATISTICS holders (the <PermissionGate> in page.tsx) — this is its
// first widget outside the /statistics route itself.
//
// Loads its own data rather than taking counts as props, so a viewer without
// the permission never triggers the queries: the gate decides whether this
// async component is ever invoked.
//
// Every figure is computed live from Applicant / InterviewNote rows — see
// getPipelineFunnel. Nothing here is stored.

// One colour per stage, warm-to-cool left to right so the funnel reads as a
// progression rather than four unrelated bars. Shared status tokens only.
const STAGE_FILL = [
  "bg-neutral-400 dark:bg-neutral-500",
  "bg-primary",
  "bg-status-pending",
  "bg-status-accepted",
] as const;

/**
 * Share of the previous stage that made it to this one.
 *
 * A stage can legitimately come out *larger* than the one before it, because
 * the stages measure different kinds of record: an applicant accepted at the
 * decision meeting whose panel never filled in an interview note counts as
 * Accepted but not as Interviewed. Reporting that as "250% of previous stage"
 * would be nonsense, so the overflow is named for what it actually is — people
 * missing a record at the earlier stage.
 */
function conversion(count: number, previous: number | null): string | null {
  if (previous === null || previous === 0) return null;
  if (count > previous) {
    const gap = count - previous;
    return `${gap} with no record at the previous stage`;
  }
  return `${Math.round((count / previous) * 100)}% of previous stage`;
}

export async function PipelineFunnel({ campaignId }: { campaignId: string }) {
  const stages = await getPipelineFunnel(campaignId);
  // Bars are scaled against the widest stage rather than the sum, so each one
  // reads as a fraction of the whole pool at a glance. Taking the max (not
  // simply the first stage) keeps every bar inside the track even when a later
  // stage overshoots an earlier one — see `conversion` for how that happens.
  const widest = Math.max(...stages.map((s) => s.count), 1);

  return (
    <WidgetPanel
      icon="filter_alt"
      title="Pipeline Funnel"
      subtitle="Cumulative — each stage counts everyone who reached it."
    >
      <div className="space-y-5">
        {stages.map((stage, i) => {
          const rate = conversion(stage.count, i === 0 ? null : stages[i - 1].count);
          return (
            <div
              key={stage.key}
              role="group"
              aria-label={`${stage.label}: ${stage.count} applicants — ${stage.hint}`}
            >
              {/* gap-3 + min-w-0 on the label so a long stage name wraps inside
                  its column instead of shoving the count off the panel edge at
                  375px. */}
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm font-semibold text-foreground">
                  {stage.label}
                </span>
                <span className="shrink-0 text-xl font-bold tabular-nums text-foreground">
                  {stage.count}
                </span>
              </div>

              <FunnelBar
                percent={(stage.count / widest) * 100}
                fillClassName={STAGE_FILL[i]}
                index={i}
              />

              <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                {stage.hint}
                {rate && ` · ${rate}`}
              </p>
            </div>
          );
        })}
      </div>
    </WidgetPanel>
  );
}

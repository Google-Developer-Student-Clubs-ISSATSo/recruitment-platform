import { Icon } from "@/components/app-shell/icon";

// Stub — real screening/scoring configuration is a Stage 3 item. This proves
// the PermissionGate composition pattern and gives CONFIGURE_SCREENING holders
// a visible landing spot until then.
export function ScoringConfigSection() {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="tune" className="text-[22px]" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Screening &amp; Scoring
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Define the Phase 1 scoring rubric and screening thresholds.
          </p>
        </div>
      </div>
      <p className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400">
        Scoring controls arrive in a later stage. You have access to this
        section because you hold <strong>Configure Screening</strong>.
      </p>
    </section>
  );
}

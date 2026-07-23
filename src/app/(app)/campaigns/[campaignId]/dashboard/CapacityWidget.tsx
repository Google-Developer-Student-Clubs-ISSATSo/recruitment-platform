import { Icon } from "@/components/app-shell/icon";
import { getCapacityUsage } from "@/lib/committee-capacity-store";
import { CapacityBar } from "../final-decision/CapacityBar";

// Per-committee seat usage on the dashboard. Deliberately thin: the bars are
// the *same* <CapacityBar> the Final Decision meeting runs on, fed by the same
// getCapacityUsage — so a coordinator glancing here and the meeting screen can
// never show different numbers, and the "over capacity" styling means the same
// thing in both places.
//
// Rendered only for ENTER_FINAL_DECISION or MANAGE_CAPACITY holders (the
// <PermissionGate> in page.tsx); it loads its own data so nobody else pays for
// the query.
export async function CapacityWidget({ campaignId }: { campaignId: string }) {
  const usage = await getCapacityUsage(campaignId);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3 border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="groups" className="text-[20px]" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Committee Capacity
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Accepted against target, counted live.
          </p>
        </div>
      </div>

      <div className="p-6">
        <CapacityBar usage={usage} />
      </div>
    </section>
  );
}

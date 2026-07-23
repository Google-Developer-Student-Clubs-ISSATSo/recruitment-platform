import { Icon } from "@/components/app-shell/icon";

// The summary tile at the top of Statistics, following the Stitch reference:
// tinted icon chip, small uppercase label, the figure at display size, then one
// line of context saying what the figure is a fraction OF.
//
// The value uses proportional figures, not tabular-nums: equal-width digits make
// a large standalone number look loose. Tabular figures are for columns that
// align vertically, which is the acceptance table, not this.
const TONE = {
  primary: "bg-primary/10 text-primary",
  accepted: "bg-status-accepted/10 text-status-accepted",
  rejected: "bg-status-rejected/10 text-status-rejected",
} as const;

export function MetricCard({
  icon,
  tone = "primary",
  label,
  value,
  context,
}: {
  icon: string;
  tone?: keyof typeof TONE;
  label: string;
  value: string;
  /** What the number is measured against — the denominator, in words. */
  context: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${TONE[tone]}`}
      >
        <Icon name={icon} className="text-[22px]" />
      </span>

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {label}
      </h3>
      <p className="mt-1 text-[32px] font-bold leading-tight text-foreground">
        {value}
      </p>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        {context}
      </p>
    </div>
  );
}

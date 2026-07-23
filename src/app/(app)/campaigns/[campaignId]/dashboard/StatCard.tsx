import { Icon } from "@/components/app-shell/icon";

// The dashboard's headline metric tile, straight off the Stitch reference: a
// tinted icon chip and an optional status chip on the top row, then a small
// uppercase label, then the number as the loudest thing on the card.
//
// Tones are the shared status tokens (never raw hex), so a card's colour means
// the same thing here as it does on a status badge or a capacity bar.
const TONE = {
  primary: "bg-primary/10 text-primary",
  accepted: "bg-status-accepted/10 text-status-accepted",
  pending: "bg-status-pending/15 text-[color:var(--status-pending)]",
  rejected: "bg-status-rejected/10 text-status-rejected",
  neutral:
    "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300",
} as const;

export type StatTone = keyof typeof TONE;

export function StatCard({
  icon,
  tone = "primary",
  label,
  value,
  hint,
  chip,
  chipTone = "neutral",
  children,
}: {
  icon: string;
  tone?: StatTone;
  /** Small uppercase caption above the number. */
  label: string;
  /** The headline figure. Omit when `children` carries the numbers instead. */
  value?: string | number;
  /** One line of context under the number. */
  hint?: string;
  /** Optional short status chip in the card's top-right corner. */
  chip?: string;
  chipTone?: StatTone;
  /** Extra content below the label — e.g. a multi-figure breakdown. */
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${TONE[tone]}`}
        >
          <Icon name={icon} className="text-[22px]" />
        </span>
        {chip && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONE[chipTone]}`}
          >
            {chip}
          </span>
        )}
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {label}
      </p>

      {value !== undefined && (
        <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
          {value}
        </p>
      )}
      {hint && (
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

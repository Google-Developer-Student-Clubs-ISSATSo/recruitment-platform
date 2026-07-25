import { Icon, type IconName } from "@/components/app-shell/icon";

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

/**
 * A 2px rule along the card's top edge in the tone colour.
 *
 * This is what makes the three tiles tell themselves apart in the top row
 * without reading their text — and what separates a TILE from a <WidgetPanel>,
 * which carries a titled header instead. Same token as `TONE`, just applied to
 * the border rather than a fill.
 *
 * Each tone needs an explicit `dark:` twin even though the colours are identical
 * in both modes. The card also carries `dark:border-neutral-800` for its sides,
 * which is a border-COLOR utility and therefore also sets border-top-color; in
 * the dark layer that would out-sort a bare `border-t-*` and erase the accent.
 * Naming the dark variant puts the accent in the same layer, where longhand
 * beats shorthand and it survives.
 */
const TONE_ACCENT = {
  primary: "border-t-primary dark:border-t-primary",
  accepted: "border-t-status-accepted dark:border-t-status-accepted",
  pending: "border-t-status-pending dark:border-t-status-pending",
  rejected: "border-t-status-rejected dark:border-t-status-rejected",
  neutral: "border-t-neutral-300 dark:border-t-neutral-600",
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
  icon: IconName;
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
    // No hover treatment, on purpose: a tile is a readout, not a control. Lift
    // and border-tint on hover are reserved for the things that actually
    // navigate (the quick links, the campaign cards), so movement on this
    // dashboard always means "this is clickable".
    <div
      className={`h-full rounded-xl border border-t-2 border-neutral-200 bg-white p-5 shadow-sm sm:p-6 dark:border-neutral-800 dark:bg-neutral-900 ${TONE_ACCENT[tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${TONE[tone]}`}
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
        // text-balance keeps the long "Not yet scheduled" / "In 12 days" GDG Day
        // strings from breaking to a lone orphan word in a narrow column.
        <p className="mt-1 text-2xl font-bold tracking-tight text-balance tabular-nums text-foreground sm:text-3xl">
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

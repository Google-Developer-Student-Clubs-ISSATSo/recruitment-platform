"use client";

// The live weighted total for the open applicant. `max` is the sum of all
// active coefficients (100 when balanced). `complete` drives whether the number
// reads as final or is clearly labeled partial, so an incomplete applicant's
// running total is never mistaken for a finished score.
//
// Renders in the (sticky) applicant header, so it is built as a compact
// single-chip baseline — label beside number, not stacked — and the partial
// caveat lives in the label ("Score (partial)") instead of a second caption
// line that repeated it word for word.
export function WeightedTotalDisplay({
  total,
  max,
  complete,
}: {
  total: number;
  max: number;
  complete: boolean;
}) {
  const rounded = Math.round(total * 100) / 100;
  return (
    <div
      className={`inline-flex items-baseline gap-2 rounded-lg border px-3 py-2 ${
        complete
          ? "border-status-accepted/30 bg-status-accepted/10"
          : "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/40"
      }`}
    >
      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        {complete ? "Score" : "Score (partial)"}
      </span>
      <div className="flex items-baseline gap-1.5">
        {/* The console's one display-size number — the thing being decided —
            stays at the 30px/700/tabular-nums spec from DESIGN.md. */}
        <span
          className={`text-3xl font-bold tabular-nums ${
            complete ? "text-status-accepted" : "text-foreground"
          }`}
        >
          {rounded}
        </span>
        <span className="text-base font-semibold text-neutral-400">
          / {Number(max.toFixed(2))}
        </span>
      </div>
    </div>
  );
}

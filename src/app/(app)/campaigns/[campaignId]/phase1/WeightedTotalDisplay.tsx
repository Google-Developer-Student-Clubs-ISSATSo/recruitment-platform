"use client";

// The live weighted total for the open applicant. `max` is the sum of all
// active coefficients (100 when balanced). `complete` drives whether the number
// reads as final or is clearly labeled partial, so an incomplete applicant's
// running total is never mistaken for a finished score.
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
      className={`rounded-xl border px-5 py-3 ${
        complete
          ? "border-status-accepted/30 bg-status-accepted/10"
          : "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/40"
      }`}
    >
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        {complete ? "Current score" : "Current score (partial)"}
      </p>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className={`text-3xl font-bold tabular-nums ${
            complete ? "text-status-accepted" : "text-foreground"
          }`}
        >
          {rounded}
        </span>
        <span className="text-lg font-semibold text-neutral-400">
          / {Number(max.toFixed(2))}
        </span>
      </div>
      {!complete && (
        <p className="mt-0.5 text-[11px] text-neutral-400">
          Incomplete — some questions are still unscored.
        </p>
      )}
    </div>
  );
}

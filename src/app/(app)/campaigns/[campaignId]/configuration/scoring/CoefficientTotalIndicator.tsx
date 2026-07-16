"use client";

import { Icon } from "@/components/app-shell/icon";

// Running total of ACTIVE questions' coefficients. The Phase 1 spec treats 100
// as a strong convention, not a hard rule — so this flags, it does not block:
//   - exactly 100 → status-accepted (green) "balanced"
//   - anything else → status-pending (yellow) with the delta from 100.
export function CoefficientTotalIndicator({ total }: { total: number }) {
  const balanced = total === 100;
  const delta = Math.round((total - 100) * 100) / 100;

  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl border px-5 py-3.5 ${
        balanced
          ? "border-status-accepted/30 bg-status-accepted/10"
          : "border-status-pending/40 bg-status-pending/10"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Icon
          name={balanced ? "check_circle" : "info"}
          className={`text-[20px] ${
            balanced
              ? "text-status-accepted"
              : "text-[color:var(--status-pending)]"
          }`}
        />
        <div>
          <p className="text-sm font-semibold text-foreground">
            Active coefficient total
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {balanced
              ? "Balanced — sums to exactly 100."
              : `Convention is 100 (${delta > 0 ? "+" : ""}${delta} off). You can still save.`}
          </p>
        </div>
      </div>
      <span
        className={`text-2xl font-bold tabular-nums ${
          balanced
            ? "text-status-accepted"
            : "text-[color:var(--status-pending)]"
        }`}
      >
        {Number(total.toFixed(2))}
      </span>
    </div>
  );
}

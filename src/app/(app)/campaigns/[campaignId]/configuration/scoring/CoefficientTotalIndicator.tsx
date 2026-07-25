"use client";

import { motion } from "motion/react";

import { Icon } from "@/components/app-shell/icon";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";

// The "Phase Summary" sidebar card from the Stitch scoring_configuration screen:
// a plain count row, then the coefficient total as a large filled tile, then a
// footnote explaining what the number is for.
//
// The tile keeps the semantic colouring this indicator has always had rather
// than the reference's flat brand fill — the total carries a judgement, and
// losing it would turn a warning into decoration. The Phase 1 spec treats 100 as
// a strong convention, not a hard rule, so this flags and never blocks:
//   - exactly 100 → status-accepted (green) "balanced"
//   - anything else → status-pending (yellow) with the delta from 100.
export function CoefficientTotalIndicator({
  total,
  questionCount,
  activeCount,
}: {
  total: number;
  questionCount: number;
  activeCount: number;
}) {
  const balanced = total === 100;
  const delta = Math.round((total - 100) * 100) / 100;
  const reduced = useReducedMotion();

  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-950/40">
      <h3 className="text-base font-semibold text-foreground">Phase Summary</h3>

      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            Total Questions
          </span>
          <span className="font-bold text-primary tabular-nums">
            {questionCount}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            Active Questions
          </span>
          <span className="font-bold text-primary tabular-nums">
            {activeCount}
          </span>
        </div>

        <div
          // The colours swap by className, but `transition-colors` still
          // animates smoothly across the swap — the browser interpolates the
          // computed background/ring colour rather than cutting to it, so
          // crossing 100 (in either direction, while typing a coefficient)
          // reads as a state change rather than a flicker.
          className={`rounded-xl p-4 transition-colors duration-200 ease-out motion-reduce:transition-none ${
            balanced
              ? "bg-status-accepted/10 ring-1 ring-status-accepted/30"
              : "bg-status-pending/10 ring-1 ring-status-pending/40"
          }`}
        >
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
            <Icon
              name={balanced ? "check_circle" : "info"}
              className={`text-[14px] transition-colors duration-200 ease-out motion-reduce:transition-none ${
                balanced
                  ? "text-status-accepted"
                  : "text-[color:var(--status-pending)]"
              }`}
            />
            Total Coefficient
          </p>
          <div className="flex items-baseline gap-2">
            {/* A small pop on the exact frame the total crosses balanced/not —
                the colour swap alone is easy to miss out of the corner of the
                eye while typing a coefficient elsewhere in the list. */}
            <motion.span
              key={balanced ? "balanced" : "unbalanced"}
              initial={reduced ? false : { scale: 0.92 }}
              animate={{ scale: 1 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: DURATION.fast, ease: EASE.out }
              }
              className={`text-4xl font-bold tabular-nums transition-colors duration-200 ease-out motion-reduce:transition-none ${
                balanced
                  ? "text-status-accepted"
                  : "text-[color:var(--status-pending)]"
              }`}
            >
              {Number(total.toFixed(2))}
            </motion.span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              units
            </span>
          </div>
          <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            {balanced
              ? "Balanced — sums to exactly 100."
              : `Convention is 100 (${delta > 0 ? "+" : ""}${delta} off). You can still save.`}
          </p>
        </div>

        <p className="px-1 text-xs italic text-neutral-500 dark:text-neutral-400">
          * Only active questions count toward the total, which sets the maximum
          possible weighted score for this phase.
        </p>
      </div>
    </div>
  );
}

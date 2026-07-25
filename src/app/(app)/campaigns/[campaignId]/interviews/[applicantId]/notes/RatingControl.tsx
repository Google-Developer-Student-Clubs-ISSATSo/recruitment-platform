"use client";

import { useState } from "react";
import { motion } from "motion/react";

import { RATING_MAX, RATING_MIN, RATING_STEP } from "@/lib/interview-note";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";

/** Trim float noise: 7 → "7", 7.25 → "7.25". */
export function fmtRating(n: number): string {
  return String(Number(n.toFixed(2)));
}

/**
 * One 0–10 rating in 0.25 steps.
 *
 * A slider rather than Phase 1's button row: that control renders one button per
 * allowed value, which works for a 3- or 5-value note scale but would mean 41
 * buttons here. The numeric readout beside it keeps the exact value legible,
 * since a slider alone can't show that you landed on 7.25 rather than 7.5.
 *
 * `onCommit` fires only once the user settles (pointer/key release), while
 * `onDraft` tracks every movement — dragging updates the readout and the live
 * AVG instantly, but writes one row and one activity-log entry rather than one
 * per pixel.
 */
export function RatingControl({
  id,
  label,
  value,
  editable,
  pending,
  onDraft,
  onCommit,
}: {
  id: string;
  label: string;
  value: number | null;
  editable: boolean;
  pending: boolean;
  onDraft: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const reduced = useReducedMotion();
  // Bumped on every commit so the readout can replay its pop even when the user
  // settles on the value it already held.
  const [pop, setPop] = useState(0);

  function commit(next: number) {
    if (!reduced) setPop((n) => n + 1);
    onCommit(next);
  }

  if (!editable) {
    return (
      <span className="inline-flex min-w-14 items-center justify-center rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-semibold text-foreground dark:bg-neutral-800">
        {value === null ? "—" : fmtRating(value)}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* The readout pops and tints on commit — a slider gives no landing
          feedback of its own, so this is the only signal that the value was
          taken. Scale + colour together, at the `fast` token: the panel holds
          seven of these and a slower confirmation would stack up while a jury
          works down the list. */}
      <motion.output
        key={pop}
        htmlFor={id}
        initial={pop === 0 || reduced ? false : { scale: 0.9 }}
        animate={{ scale: 1 }}
        transition={
          reduced ? { duration: 0 } : { duration: DURATION.fast, ease: EASE.out }
        }
        className={`min-w-14 shrink-0 rounded-lg border px-3 py-1.5 text-center text-sm font-semibold tabular-nums transition-colors duration-150 ease-out motion-reduce:transition-none ${
          value === null
            ? "border-neutral-200 text-neutral-400 dark:border-neutral-700"
            : "border-primary/30 bg-primary/5 text-primary"
        }`}
      >
        {value === null ? "—" : fmtRating(value)}
      </motion.output>
      <input
        id={id}
        type="range"
        min={RATING_MIN}
        max={RATING_MAX}
        step={RATING_STEP}
        // An unrated field parks the handle at 0 but still reads "—": the first
        // interaction is what assigns a real value.
        value={value ?? 0}
        disabled={pending}
        aria-label={`${label} rating, 0 to 10`}
        aria-valuetext={value === null ? "Not rated" : fmtRating(value)}
        onChange={(e) => onDraft(Number(e.target.value))}
        onPointerUp={(e) => commit(Number(e.currentTarget.value))}
        onKeyUp={(e) => commit(Number(e.currentTarget.value))}
        onBlur={(e) => commit(Number(e.currentTarget.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-primary disabled:opacity-50 dark:bg-neutral-700"
      />
    </div>
  );
}

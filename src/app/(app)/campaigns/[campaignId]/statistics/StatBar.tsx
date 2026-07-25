"use client";

import { motion } from "motion/react";

import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";

/**
 * A plain proportion bar that grows to its share on load.
 *
 * The recharts figures on this page animate themselves; these two bar sets —
 * the Phase 1 outcome rows and the acceptance table's fill column — are not
 * charts, they are CSS tracks inside server components. This is the smallest
 * client boundary that lets them enter the same way, so the whole page settles
 * as one movement rather than the charts growing while everything else is
 * already at rest.
 *
 * `index` staggers by position, matching the dashboard funnel: a set of bars
 * arriving in reading order is legible in a way four bars appearing at once is
 * not.
 */
export function StatBar({
  percent,
  fillClassName,
  trackClassName = "h-3",
  index = 0,
}: {
  /** 0–100, already scaled by the caller. */
  percent: number;
  /** A shared token class — never a raw colour. */
  fillClassName: string;
  /** Track height/shape utilities, so callers keep their own sizing. */
  trackClassName?: string;
  /** Position in the set, used to stagger the growth. */
  index?: number;
}) {
  const reduced = useReducedMotion();

  return (
    <div
      className={`overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800 ${trackClassName}`}
    >
      <motion.div
        // Keyed on `reduced` so a flip remounts this node.
        //
        // Without it the bar animates even for users who asked it not to:
        // useReducedMotion reports false in the SSR/hydration snapshot, so the
        // first render commits `initial={{ width: 0 }}` and starts the 0.3s
        // growth. When the hook resolves to true a moment later, `initial` is
        // never re-read and the `animate` target is unchanged — motion has no
        // reason to restart, so the in-flight animation just plays out and the
        // zero-length transition below never gets a chance to apply. Remounting
        // throws that animation away and re-enters with `initial={false}`,
        // painting the final width outright.
        key={reduced ? "static" : "animated"}
        className={`h-full rounded-full ${fillClassName}`}
        // Reduced motion paints the final width immediately: the bar is just as
        // readable, it simply doesn't travel to get there.
        initial={reduced ? false : { width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={
          reduced
            ? { duration: 0 }
            : { duration: DURATION.slow, ease: EASE.out, delay: index * 0.05 }
        }
      />
    </div>
  );
}

"use client";

import { motion } from "motion/react";

import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";

/**
 * One funnel track, whose fill grows from zero to its share on load.
 *
 * This is the one place on the dashboard where the motion carries meaning rather
 * than just softening an entrance: the funnel is a sequence, and bars that grow
 * in order make the drop-off between stages legible in a way four bars appearing
 * at their final width does not. That is why the funnel animates its data and
 * the stat tiles only fade in.
 *
 * The stagger is driven by `index` rather than a parent <StaggerGroup>, because
 * the delay has to line up with the bars' own order in the pipeline, not with
 * whatever else happens to be rendering on the page at the time.
 */
export function FunnelBar({
  percent,
  fillClassName,
  index,
}: {
  /** 0–100, already scaled against the widest stage by the caller. */
  percent: number;
  /** The stage's fill colour — a shared token class, never a raw colour. */
  fillClassName: string;
  /** Position in the funnel, used to stagger the growth. */
  index: number;
}) {
  const reduced = useReducedMotion();

  return (
    <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
      <motion.div
        className={`h-full rounded-full ${fillClassName}`}
        // Reduced motion renders the final width immediately — the bar is still
        // fully readable, it just doesn't travel to get there.
        initial={reduced ? false : { width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={
          reduced
            ? { duration: 0 }
            : {
                duration: DURATION.slow,
                ease: EASE.out,
                delay: index * 0.05,
              }
        }
      />
    </div>
  );
}

"use client";

import { motion } from "motion/react";

import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";

/**
 * The table body, fading in whenever the rendered slice changes.
 *
 * Paging and filtering here are real server round-trips — the query re-runs with
 * a new skip/take. Without a transition the ten rows swap instantly and it is
 * genuinely hard to tell whether anything happened, especially when consecutive
 * pages hold similar names. A single group fade is enough to say "this is a new
 * set of rows".
 *
 * `signature` is what drives it: the caller passes the page number plus the
 * active filters, so a remount happens exactly when the slice changes — not on
 * every unrelated re-render. Rendered as `motion.tbody` because a <div> is not
 * valid inside <table>.
 *
 * Deliberately opacity-only, and at the `fast` token. The rows must not appear to
 * slide into place on every page turn: paging is something a coordinator does
 * repeatedly, and travel that reads as "nice" the first time reads as lag the
 * twentieth.
 */
export function AnimatedTableBody({
  signature,
  className,
  children,
}: {
  /** Changes when the rendered slice does — page + filters. */
  signature: string;
  className?: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.tbody
      key={signature}
      className={className}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        reduced ? { duration: 0 } : { duration: DURATION.fast, ease: EASE.out }
      }
    >
      {children}
    </motion.tbody>
  );
}

/**
 * The same treatment for the below-md stacked card list, which is a <ul> rather
 * than a table body but should transition identically — the two layouts are the
 * same data and must not feel like different pages.
 */
export function AnimatedCardList({
  signature,
  className,
  children,
}: {
  signature: string;
  className?: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.ul
      key={signature}
      className={className}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        reduced ? { duration: 0 } : { duration: DURATION.fast, ease: EASE.out }
      }
    >
      {children}
    </motion.ul>
  );
}

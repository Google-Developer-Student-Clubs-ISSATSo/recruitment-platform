"use client";

import { motion } from "motion/react";

import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";

/**
 * A table body (or the card-list equivalent below md) that fades in whenever the
 * rendered slice changes — shared by every server-paginated/filtered list in the
 * app (Applicants, Admin Permissions, Activity Log) so they all read the same
 * way when the underlying query re-runs.
 *
 * `signature` is what drives it: pass the page number plus the active filters,
 * so a remount happens exactly when the slice changes, not on every unrelated
 * re-render. Deliberately opacity-only, at the `fast` token — paging is
 * something these screens do repeatedly, and travel that reads as "nice" the
 * first time reads as lag the twentieth.
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
 * The same treatment for a below-md stacked card list, which is a <ul> rather
 * than a table body but must transition identically — the two layouts are the
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

/**
 * Non-table variant of the same fade, for a plain block list (e.g. Admin
 * Permissions' member rows, which are <div>s, not a <table>).
 */
export function AnimatedList({
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
    <motion.div
      key={signature}
      className={className}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        reduced ? { duration: 0 } : { duration: DURATION.fast, ease: EASE.out }
      }
    >
      {children}
    </motion.div>
  );
}

"use client";

import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app-shell/icon";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";
import type { BulkOutcome } from "./actions";

/**
 * Sticky bar shown while the row checkboxes hold a selection. Accept and Reject
 * go through a ConfirmDialog in the caller first (deciding many people at once
 * is exactly the "high-consequence" bar), while To Discuss and Revert run
 * directly — both are deliberately light, advisory/reversible moves.
 */
export function SelectionBulkBar({
  selectedCount,
  /** The whole filtered set is in the selection, not just this page's rows. */
  allFilterSelected,
  pending,
  onOutcome,
  onClear,
}: {
  selectedCount: number;
  allFilterSelected: boolean;
  pending: boolean;
  onOutcome: (outcome: BulkOutcome) => void;
  onClear: () => void;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 1 } : { opacity: 0, y: 16 }}
      transition={
        reduced ? { duration: 0 } : { duration: DURATION.base, ease: EASE.out }
      }
      className="sticky bottom-4 z-40 flex flex-wrap items-center gap-2.5 rounded-xl border border-primary/30 bg-white p-3 shadow-lg dark:border-primary/40 dark:bg-neutral-900"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon name="check_circle" className="text-[18px] text-primary" />
        {selectedCount} selected
        {allFilterSelected && (
          <span className="font-normal text-neutral-500 dark:text-neutral-400">
            — all matching this filter
          </span>
        )}
      </span>

      <Button size="sm" disabled={pending} onClick={() => onOutcome("ACCEPT")}>
        <Icon name="how_to_reg" className="text-[16px]" />
        Accept
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => onOutcome("REJECT")}
      >
        <Icon name="do_not_disturb_on" className="text-[16px]" />
        Reject
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => onOutcome("TO_DISCUSS")}
      >
        <Icon name="forum" className="text-[16px]" />
        To Discuss
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => onOutcome("REVERT")}
      >
        <Icon name="undo" className="text-[16px]" />
        Revert
      </Button>

      <button
        type="button"
        onClick={onClear}
        disabled={pending}
        className="ml-auto cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-neutral-500 transition-colors hover:text-foreground disabled:opacity-50 dark:text-neutral-400"
      >
        Clear selection
      </button>
    </motion.div>
  );
}

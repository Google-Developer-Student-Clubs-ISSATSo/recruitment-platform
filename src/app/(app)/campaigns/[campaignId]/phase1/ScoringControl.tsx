"use client";

import { useState } from "react";
import { motion } from "motion/react";

import { Icon } from "@/components/app-shell/icon";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";

// Trim float noise: 0.5 → "0.5", 0.25 → "0.25", 1 → "1".
export function fmtScale(n: number) {
  return String(Number(n.toFixed(2)));
}

// A generic, note-scale-driven scoring control: one button per allowed value in
// the question's own noteScale array — never a hardcoded set. Whatever the TM
// Lead configures (0/0.5/1, or 0/0.25/0.5/0.75/1, or a narrowed binary scale)
// renders here automatically.
//
// When not editable it shows the current value read-only with a lock label
// (e.g. "Scored by Technical Team" for the technical question viewed by a plain
// reviewer), or a waiting placeholder if nothing has been scored yet.
export function ScoringControl({
  noteScale,
  value,
  editable,
  pending,
  lockLabel,
  onSelect,
}: {
  noteScale: number[];
  value: number | undefined;
  editable: boolean;
  pending: boolean;
  lockLabel?: string;
  onSelect: (value: number) => void;
}) {
  if (!editable) {
    return (
      <div className="flex items-center gap-2">
        {value === undefined ? (
          <span className="text-sm italic text-neutral-400">
            Not scored yet
          </span>
        ) : (
          <span className="inline-flex items-center rounded-md bg-neutral-100 px-2.5 py-1 text-sm font-semibold text-foreground dark:bg-neutral-800">
            {fmtScale(value)}
          </span>
        )}
        <span className="flex items-center gap-1 text-[11px] font-medium text-neutral-400">
          <Icon name="lock" className="text-[14px]" />
          {lockLabel ?? "Read only"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group">
      {noteScale.map((v) => (
        <ScoreButton
          key={v}
          value={v}
          selected={value !== undefined && Math.abs(v - value) < 1e-9}
          pending={pending}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

/**
 * One value on the scale.
 *
 * The pop on click is doing real work, not decoration: this control has no Save
 * button because a pick is written to the database immediately, and without any
 * acknowledgement there is nothing to distinguish "saved" from "I clicked and
 * the page ignored me". A 200ms scale beat gives the click a receipt. It fires
 * on every pick — including re-picking the value that's already selected, which
 * still issues a write and so still deserves feedback.
 */
function ScoreButton({
  value,
  selected,
  pending,
  onSelect,
}: {
  value: number;
  selected: boolean;
  pending: boolean;
  onSelect: (value: number) => void;
}) {
  const reduced = useReducedMotion();
  const [pulsing, setPulsing] = useState(false);

  return (
    <motion.button
      type="button"
      disabled={pending}
      aria-pressed={selected}
      onClick={() => {
        if (!reduced) setPulsing(true);
        onSelect(value);
      }}
      animate={pulsing ? { scale: [1, 1.12, 1] } : { scale: 1 }}
      transition={
        reduced ? { duration: 0 } : { duration: DURATION.base, ease: EASE.out }
      }
      onAnimationComplete={() => setPulsing(false)}
      className={`min-w-9 cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ease-out disabled:cursor-default disabled:opacity-50 motion-reduce:transition-none ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-neutral-300 bg-transparent text-neutral-600 hover:border-primary hover:text-primary dark:border-neutral-700 dark:text-neutral-300"
      }`}
    >
      {fmtScale(value)}
    </motion.button>
  );
}

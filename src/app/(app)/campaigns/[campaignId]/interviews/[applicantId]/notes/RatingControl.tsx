"use client";

import { useState } from "react";
import { useAnimate } from "motion/react";

import { RATING_MAX, RATING_MIN, RATING_STEP } from "@/lib/interview-note";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";

/** Trim float noise: 7 → "7", 7.25 → "7.25". */
export function fmtRating(n: number): string {
  return String(Number(n.toFixed(2)));
}

/**
 * Parse typed input into a valid rating: accepts a comma decimal separator
 * ("7,5"), clamps to the scale and snaps to the nearest step. Returns null for
 * anything that isn't a number, so the caller can revert instead of guessing.
 */
function parseRating(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(RATING_MAX, Math.max(RATING_MIN, n));
  return Math.round(clamped / RATING_STEP) * RATING_STEP;
}

/**
 * One 0–10 rating in 0.25 steps.
 *
 * A slider rather than Phase 1's button row: that control renders one button per
 * allowed value, which works for a 3- or 5-value note scale but would mean 41
 * buttons here. The slider is for quick, coarse placement; the number field
 * beside it is for juries who already know the score — type it, or nudge it
 * with ↑/↓ by one step. Both stay in sync.
 *
 * `onCommit` fires only once the user settles (pointer/key release, Enter or
 * blur on the field), while `onDraft` tracks every slider movement — dragging
 * updates the field and the live AVG instantly, but writes one row and one
 * activity-log entry rather than one per pixel.
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
  const [scope, animate] = useAnimate<HTMLInputElement>();
  // Raw text while the field is being edited; null means "not editing", so the
  // field mirrors `value` (and follows the slider while it's dragged).
  const [text, setText] = useState<string | null>(null);

  function commit(next: number) {
    // The field pops on commit — neither control gives landing feedback of its
    // own, so this is the signal that the value was taken. At the `fast` token:
    // the panel holds seven of these and a slower confirmation would stack up
    // while a jury works down the list. Animated in place rather than by
    // remounting, so a commit via Enter keeps focus in the field.
    if (!reduced && scope.current) {
      animate(
        scope.current,
        { scale: [0.9, 1] },
        { duration: DURATION.fast, ease: EASE.out },
      );
    }
    onCommit(next);
  }

  function commitText() {
    if (text === null) return;
    const parsed = parseRating(text);
    setText(null);
    // Invalid or cleared input reverts to the stored value — a rating can't be
    // un-set, and silently writing 0 would be worse than doing nothing.
    if (parsed === null || parsed === value) return;
    onDraft(parsed);
    commit(parsed);
  }

  function step(direction: 1 | -1) {
    const base = parseRating(text ?? "") ?? value ?? RATING_MIN;
    const next = Math.min(
      RATING_MAX,
      Math.max(RATING_MIN, base + direction * RATING_STEP),
    );
    setText(null);
    onDraft(next);
    commit(next);
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
      {/* Text + inputMode rather than type="number": number inputs reject a
          comma decimal separator in some locales and swallow invalid text
          without telling us, both of which matter for quick typed entry. */}
      <input
        ref={scope}
        id={`${id}-value`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text ?? (value === null ? "" : fmtRating(value))}
        placeholder="—"
        disabled={pending}
        aria-label={`${label} rating, 0 to 10`}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitText();
          } else if (e.key === "Escape") {
            setText(null);
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            step(e.key === "ArrowUp" ? 1 : -1);
          }
        }}
        className={`w-16 shrink-0 rounded-lg border px-2 py-1.5 text-center text-sm font-semibold tabular-nums transition-colors duration-150 ease-out placeholder:text-neutral-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 motion-reduce:transition-none ${
          value === null
            ? "border-neutral-200 bg-transparent text-foreground dark:border-neutral-700"
            : "border-primary/30 bg-primary/5 text-primary"
        }`}
      />
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
        aria-label={`${label} rating slider, 0 to 10`}
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

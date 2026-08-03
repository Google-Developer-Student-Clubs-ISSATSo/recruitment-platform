"use client";

import { useState, useTransition } from "react";

import { PANEL_SIZES, type PanelSize } from "@/lib/panel-size";
import { updatePanelSize } from "./actions";

const OPTION_COPY: Record<PanelSize, { title: string; detail: string }> = {
  3: {
    title: "3 seats",
    detail: "One interviewer per committee — MKT, TM and EER.",
  },
  4: {
    title: "4 seats",
    detail: "The three committees plus a floating seat for the Club Lead.",
  },
};

/**
 * Panel size, as two radio cards rather than a number input: there are exactly
 * two shapes the club runs, and each needs a sentence of explanation that a
 * bare stepper has nowhere to put.
 *
 * Saves on selection, like the scoring config's fields — no separate submit for
 * a single setting.
 */
export function PanelSizeForm({
  campaignId,
  initialPanelSize,
}: {
  campaignId: string;
  initialPanelSize: PanelSize;
}) {
  const [size, setSize] = useState<PanelSize>(initialPanelSize);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: PanelSize) {
    if (next === size) return;
    const previous = size;
    setSize(next);
    setError(null);
    startTransition(async () => {
      const result = await updatePanelSize(campaignId, next);
      if (!result.ok) {
        setSize(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="mt-5 space-y-3">
      <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Panel size</legend>
        {PANEL_SIZES.map((option) => {
          const selected = size === option;
          return (
            <label
              key={option}
              className={`flex cursor-pointer gap-3 rounded-lg border px-4 py-3 transition-colors duration-150 ease-out motion-reduce:transition-none ${
                selected
                  ? "border-primary bg-primary/5"
                  : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
              }`}
            >
              <input
                type="radio"
                name="panelSize"
                value={option}
                checked={selected}
                onChange={() => choose(option)}
                className="mt-0.5 size-4 shrink-0 accent-[color:var(--color-primary)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  {OPTION_COPY[option].title}
                </span>
                <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
                  {OPTION_COPY[option].detail}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Applies to panels created from now on. Interviews already scheduled keep
        the seats their panel was built with.
      </p>

      {error && (
        <p className="rounded-lg bg-status-rejected/10 px-3 py-2 text-xs text-status-rejected">
          {error}
        </p>
      )}
    </div>
  );
}

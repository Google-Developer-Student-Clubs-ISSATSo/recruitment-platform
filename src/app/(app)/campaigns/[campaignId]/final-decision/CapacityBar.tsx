"use client";

import { Icon } from "@/components/app-shell/icon";
import { capacityLevel, type CommitteeUsage } from "@/lib/final-decision";

// Per-committee seat usage, pinned above everything else on the page. Sized for
// a screen-share: the count is the largest text on the row, and the fill bar
// carries the same status colour so the state reads from across a call before
// anyone parses the numbers.
//
// Colours are the shared status tokens, not one-off hex: green under target,
// amber exactly at it, red over it.
const LEVEL_STYLE = {
  under: {
    text: "text-status-accepted",
    fill: "bg-status-accepted",
    ring: "border-neutral-200 dark:border-neutral-800",
  },
  at: {
    text: "text-status-pending",
    fill: "bg-status-pending",
    ring: "border-status-pending/40",
  },
  over: {
    text: "text-status-rejected",
    fill: "bg-status-rejected",
    ring: "border-status-rejected/50",
  },
} as const;

function caption(accepted: number, target: number) {
  if (accepted > target) {
    const over = accepted - target;
    return `${over} over capacity`;
  }
  if (accepted >= target) return "Capacity reached";
  const left = target - accepted;
  return `${left} seat${left === 1 ? "" : "s"} left`;
}

export function CapacityBar({ usage }: { usage: CommitteeUsage[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {usage.map(({ committee, accepted, target }) => {
        const level = capacityLevel(accepted, target);
        const style = LEVEL_STYLE[level];
        // A zero target would divide by zero; it also means "no seats", which
        // any acceptance overfills — so the bar shows full.
        const pct =
          target <= 0
            ? accepted > 0
              ? 100
              : 0
            : Math.min(100, (accepted / target) * 100);

        return (
          // Labelled as a group: read on its own, "MKT 0/4 4 seats left" is
          // three disconnected fragments to a screen reader.
          <div
            key={committee}
            role="group"
            aria-label={`${committee} capacity: ${accepted} of ${target} accepted — ${caption(accepted, target)}`}
            className={`rounded-xl border bg-white p-5 dark:bg-neutral-900 ${style.ring}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                {committee}
              </span>
              <span className={`text-3xl font-bold tabular-nums ${style.text}`}>
                {accepted}
                <span className="text-neutral-400 dark:text-neutral-600">
                  /{target}
                </span>
              </span>
            </div>

            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className={`h-full rounded-full transition-all ${style.fill}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <p
              className={`mt-2 flex items-center gap-1 text-sm font-semibold ${
                level === "under"
                  ? "text-neutral-500 dark:text-neutral-400"
                  : style.text
              }`}
            >
              {level !== "under" && (
                <Icon
                  name={level === "over" ? "error" : "check_circle"}
                  className="text-[16px]"
                />
              )}
              {caption(accepted, target)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

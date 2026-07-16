"use client";

// Editor for a question's note scale. 0 and 1 are always present and shown as
// fixed (non-interactive) endpoints. 0.25, 0.5, 0.75 are optional midpoints
// rendered as toggle chips — 0.5 is on by default for new questions. Toggling a
// chip rebuilds the sorted array [0, …enabled midpoints…, 1] and hands it back
// to the parent, which persists it.

const MIDPOINTS = [0.25, 0.5, 0.75] as const;

function fmt(n: number) {
  // 0.5 → "0.5", 0.25 → "0.25", trimming any float noise.
  return String(Number(n.toFixed(2)));
}

export function NoteScaleEditor({
  value,
  disabled,
  onChange,
}: {
  value: number[];
  disabled?: boolean;
  onChange: (next: number[]) => void;
}) {
  const enabled = new Set(value);

  function toggle(mid: number) {
    const midpoints = MIDPOINTS.filter((m) =>
      m === mid ? !enabled.has(m) : enabled.has(m),
    );
    onChange([0, ...midpoints, 1].sort((a, b) => a - b));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FixedChip label={fmt(0)} />
      {MIDPOINTS.map((mid) => {
        const on = enabled.has(mid);
        return (
          <button
            key={mid}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => toggle(mid)}
            className={`rounded-md border px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              on
                ? "border-primary bg-primary/10 text-primary"
                : "border-neutral-300 bg-transparent text-neutral-400 hover:border-neutral-400 hover:text-neutral-600 dark:border-neutral-700 dark:hover:border-neutral-500 dark:hover:text-neutral-300"
            }`}
          >
            {fmt(mid)}
          </button>
        );
      })}
      <FixedChip label={fmt(1)} />
    </div>
  );
}

// The immovable 0 and 1 endpoints — visually distinct from the toggle chips and
// not clickable, so it's clear they can't be removed.
function FixedChip({ label }: { label: string }) {
  return (
    <span
      title="Always present"
      className="rounded-md border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
    >
      {label}
    </span>
  );
}

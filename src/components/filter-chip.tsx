// A pill-shaped toggle for list filters — Phase 1 Selection's outcome filters
// and Phase 2's committee / red-flag filters. Extracted from SelectionClient so
// the two lists share one look and one behaviour.
//
// aria-pressed exposes the on/off state to screen readers (the colour alone
// carried it before). The active fill is --primary-text, not --primary: white
// 12px text on the bright brand blue measured 3.56:1, under AA; in dark mode
// the fill is the light blue, so the label flips to near-black.
export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-primary-text px-3 py-1 text-xs font-semibold text-white dark:bg-primary dark:text-neutral-950"
          : "rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
      }
    >
      {children}
    </button>
  );
}

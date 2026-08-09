import { Icon } from "@/components/app-shell/icon";

/**
 * "What does this page mean for me?" — the viewer's own panel count, above a
 * board that otherwise shows everyone's assignments equally.
 *
 * The copy is parametrized on `count`, never a hardcoded number, and the zero
 * case is deliberately written as a plain statement of fact rather than an
 * empty state: most members are on no panels at all, and that is the normal
 * condition of this page, not something to warn them about. Same reason it
 * keeps the neutral surface and muted icon in every case instead of switching
 * to a status colour — being on three panels is not "good" and being on none
 * is not "bad".
 */
export function MyPanelSummary({ count }: { count: number }) {
  const message =
    count === 0
      ? "You're not on any interview panels this cycle."
      : count === 1
        ? "You're on 1 interview panel this cycle."
        : `You're on ${count} interview panels this cycle.`;

  return (
    <p className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-300">
      <Icon
        name="event_seat"
        className="shrink-0 text-[18px] text-neutral-400"
        aria-hidden
      />
      {message}
      {count > 0 && (
        <span className="text-neutral-500 dark:text-neutral-400">
          Look for <strong className="font-semibold text-primary">(you)</strong>{" "}
          on the board below.
        </span>
      )}
    </p>
  );
}

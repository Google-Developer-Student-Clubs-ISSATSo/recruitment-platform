"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app-shell/icon";
import { useSoftRefresh } from "@/lib/use-soft-refresh";

/**
 * Manual soft refresh for a server-rendered page.
 *
 * `router.refresh()` re-runs the page's server component against the CURRENT
 * URL, so whatever lives in the URL — page number, search text, filters —
 * carries over unchanged, and scroll position survives because the page never
 * remounts.
 *
 * THE CAVEAT THAT DECIDES WHERE THIS WORKS: a soft refresh streams new props
 * into the existing client components rather than remounting them, so any
 * client component that copies a server prop into `useState` keeps its old
 * copy and will NOT visibly update. Only add this to a page whose data is
 * rendered straight from props (or whose stateful children re-sync
 * deliberately). See the per-page notes at each call site.
 *
 * `outline` by default: on every page that has one, this sits beside a primary
 * action (Import CSV, Send Invites) and is the secondary of the two.
 */
export function RefreshButton({
  label = "Refresh",
  ariaLabel = "Refresh this page",
  pending: pendingProp,
  onRefresh,
}: {
  /** Button text. Kept short — it sits in a header row beside other actions. */
  label?: string;
  /** Spoken name. Say what is refreshed, since "Refresh" alone is ambiguous. */
  ariaLabel?: string;
  /**
   * Share a transition with another trigger on the same page (e.g. interval
   * polling via <AutoRefresh>), so a manual click and a poll tick can never
   * both be in flight as separate refreshes. Omit either prop to keep this
   * button self-contained, as every existing call site does today.
   */
  pending?: boolean;
  onRefresh?: () => void;
}) {
  const own = useSoftRefresh();
  const pending = pendingProp ?? own.pending;
  const refresh = onRefresh ?? own.refresh;

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      aria-label={ariaLabel}
      onClick={refresh}
    >
      <Icon
        name="refresh"
        className={`text-[18px] ${pending ? "animate-spin" : ""}`}
      />
      {pending ? "Refreshing…" : label}
    </Button>
  );
}

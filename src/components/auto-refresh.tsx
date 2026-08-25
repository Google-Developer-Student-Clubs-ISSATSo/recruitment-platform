"use client";

import { usePolling } from "@/lib/use-polling";
import { useSoftRefresh } from "@/lib/use-soft-refresh";

/**
 * Invisible interval-driven `router.refresh()` for a server-rendered page —
 * the polling counterpart to <RefreshButton>. Same caveat applies: only safe
 * on a page whose data renders straight from server props, not one where a
 * client child has copied a prop into `useState`.
 *
 * Paused while the tab is backgrounded (see usePolling) so an unattended tab
 * doesn't keep re-fetching.
 */
export function AutoRefresh({
  intervalMs = 30_000,
  refresh: refreshProp,
}: {
  intervalMs?: number;
  /**
   * Share a transition with a <RefreshButton> on the same page, so a manual
   * click and a poll tick can never overlap as separate in-flight refreshes.
   * Omit to have this component own its own transition.
   */
  refresh?: () => void;
}) {
  const own = useSoftRefresh();
  const refresh = refreshProp ?? own.refresh;

  usePolling(refresh, intervalMs);

  return null;
}

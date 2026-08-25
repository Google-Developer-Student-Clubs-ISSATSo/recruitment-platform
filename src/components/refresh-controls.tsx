"use client";

import { RefreshButton } from "./refresh-button";
import { AutoRefresh } from "./auto-refresh";
import { useSoftRefresh } from "@/lib/use-soft-refresh";

/**
 * A manual <RefreshButton> plus interval-driven <AutoRefresh>, sharing one
 * `useSoftRefresh` transition — clicking Refresh mid-poll (or a poll tick
 * landing mid-click) is the same `router.refresh()` call from the shared
 * pending state, never two overlapping ones.
 */
export function RefreshControls({
  ariaLabel = "Refresh this page",
  intervalMs = 30_000,
}: {
  ariaLabel?: string;
  intervalMs?: number;
}) {
  const { pending, refresh } = useSoftRefresh();

  return (
    <>
      <RefreshButton ariaLabel={ariaLabel} pending={pending} onRefresh={refresh} />
      <AutoRefresh intervalMs={intervalMs} refresh={refresh} />
    </>
  );
}

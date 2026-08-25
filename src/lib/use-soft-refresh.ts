"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * `router.refresh()` wrapped in a `useTransition`, shared by every trigger that
 * soft-refreshes a page: the manual Refresh button and interval-driven polling.
 * Sharing the transition means a manual click and a poll tick can never both be
 * "pending" as separate in-flight refreshes — React coalesces them into the one
 * transition, so there is no duplicate/overlapping request either can produce.
 */
export function useSoftRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(() => router.refresh());
  }

  return { pending, refresh };
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app-shell/icon";

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
}: {
  /** Button text. Kept short — it sits in a header row beside other actions. */
  label?: string;
  /** Spoken name. Say what is refreshed, since "Refresh" alone is ambiguous. */
  ariaLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      aria-label={ariaLabel}
      onClick={() => startTransition(() => router.refresh())}
    >
      <Icon
        name="refresh"
        className={`text-[18px] ${pending ? "animate-spin" : ""}`}
      />
      {pending ? "Refreshing…" : label}
    </Button>
  );
}

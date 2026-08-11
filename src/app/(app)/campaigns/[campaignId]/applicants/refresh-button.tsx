"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app-shell/icon";

// Re-fetches the server-rendered applicant list via a soft refresh, so a
// newly-submitted applicant (added by the Google Form webhook) shows up
// without a full page reload. Same router.refresh() pattern as the Activity
// Log's RefreshButton: it re-runs the page's server component against the
// CURRENT URL, so the active page/search/status/committee filters carry over
// unchanged — nothing here resets them, and scroll position is untouched
// because the page never remounts.
//
// `outline`, not `default`: this sits beside <ImportPanel>'s primary "Import
// CSV" button, and refresh is the secondary action of the two.
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      aria-label="Refresh applicant list"
      onClick={() => startTransition(() => router.refresh())}
    >
      <Icon
        name="refresh"
        className={`text-[18px] ${pending ? "animate-spin" : ""}`}
      />
      {pending ? "Refreshing…" : "Refresh"}
    </Button>
  );
}

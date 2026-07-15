"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/app-shell/icon";

// Re-fetches the server-rendered log via a soft refresh. The only interactive
// island on the page; everything else is server-rendered.
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
    >
      <Icon
        name="refresh"
        className={`text-[18px] ${pending ? "animate-spin" : ""}`}
      />
      {pending ? "Refreshing…" : "Refresh Log"}
    </button>
  );
}

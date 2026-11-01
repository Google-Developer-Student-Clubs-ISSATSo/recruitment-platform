"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app-shell/icon";

// Downloads the interview-reviews PDF. A plain link would work, but building
// the file takes a moment and a link gives no sign of that — so this fetches it,
// shows "Generating…" meanwhile, and says so if it fails instead of leaving the
// person staring at a button that did nothing.
export function InterviewReviewsButton({ campaignId }: { campaignId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/campaigns/${campaignId}/final-decision/interview-reviews`,
      );
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? "You don't have access to this export."
            : "The PDF couldn't be generated.",
        );
      }
      const filename =
        /filename="([^"]+)"/.exec(
          res.headers.get("Content-Disposition") ?? "",
        )?.[1] ?? "interview-reviews.pdf";

      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked a beat later: some browsers start the save asynchronously.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The PDF couldn't be generated.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        size="lg"
        variant="outline"
        disabled={busy}
        onClick={download}
      >
        <Icon name="download" className="text-[18px]" />
        {busy ? "Generating PDF…" : "Interview Reviews PDF"}
      </Button>
      {error && (
        <p role="alert" className="text-sm font-medium text-status-rejected-text">
          {error}
        </p>
      )}
    </div>
  );
}

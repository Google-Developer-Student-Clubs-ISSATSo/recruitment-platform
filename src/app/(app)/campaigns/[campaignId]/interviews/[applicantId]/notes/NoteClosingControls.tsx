"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app-shell/icon";
import { reopenInterviewNoteAction } from "./actions";

/**
 * Reopen a closed interview note — shown only to MANAGE_ACCOUNTS on a CLOSED
 * note; restores normal panel-member access (and editability, for everyone —
 * reopening is the one way back into a closed note).
 *
 * The counterpart close control lives INSIDE NoteEditor at the bottom of the
 * notes page, since close is the act that saves — it needs the live draft, and
 * the editor owns that state.
 */
export function NoteClosingControls({
  campaignId,
  applicantId,
}: {
  campaignId: string;
  applicantId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function doReopen() {
    setError(null);
    startTransition(async () => {
      const res = await reopenInterviewNoteAction(campaignId, applicantId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" disabled={pending} onClick={doReopen}>
        <Icon name="lock_open" className="text-[16px]" />
        Reopen Interview Note
      </Button>
      {error && <span className="text-xs text-status-rejected">{error}</span>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/app-shell/icon";
import {
  closeInterviewNoteAction,
  reopenInterviewNoteAction,
} from "./actions";

/**
 * Close / Reopen controls for an interview note.
 *
 *   - "close"  — shown to a panel member (or MANAGE_ACCOUNTS) on an OPEN note.
 *     Closing removes their OWN access afterwards, so the confirm dialog says so
 *     and, on success, we route back to the interviews board rather than leave
 *     them staring at a page they can no longer load.
 *   - "reopen" — shown only to MANAGE_ACCOUNTS on a CLOSED note; restores normal
 *     panel-member access.
 */
export function NoteClosingControls({
  campaignId,
  applicantId,
  mode,
}: {
  campaignId: string;
  applicantId: string;
  mode: "close" | "reopen";
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function doClose() {
    setError(null);
    startTransition(async () => {
      const res = await closeInterviewNoteAction(campaignId, applicantId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // The closer loses access to this page — send them back to the board.
      router.push(`/campaigns/${campaignId}/interviews`);
    });
  }

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

  if (mode === "reopen") {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={doReopen}
        >
          <Icon name="lock_open" className="text-[16px]" />
          Reopen Interview Note
        </Button>
        {error && <span className="text-xs text-status-rejected">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => setDialogOpen(true)}
        className="border-status-rejected/40 text-status-rejected hover:bg-status-rejected/10"
      >
        <Icon name="lock" className="text-[16px]" />
        Close Interview
      </Button>
      {error && <span className="text-xs text-status-rejected">{error}</span>}

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Close this interview note?"
        description={
          <>
            Closing locks the note. After this you&apos;ll{" "}
            <strong>no longer be able to view or edit it</strong> — only an
            account manager can reopen it or see it again. Any scores and remarks
            already entered are kept.
          </>
        }
        confirmLabel="Close interview"
        destructive
        onConfirm={doClose}
      />
    </div>
  );
}

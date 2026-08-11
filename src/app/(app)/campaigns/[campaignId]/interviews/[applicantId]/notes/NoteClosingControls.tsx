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
  tooEarly = false,
  canForceClose = false,
  scheduledLabel = null,
  allowedAtLabel = null,
}: {
  campaignId: string;
  applicantId: string;
  mode: "close" | "reopen";
  /** The interview's scheduled time (+ grace) hasn't passed yet. */
  tooEarly?: boolean;
  /** MANAGE_ACCOUNTS — may override {@link tooEarly}, after confirming. */
  canForceClose?: boolean;
  /** Tunis-formatted scheduled time, for the messages. Null when unscheduled. */
  scheduledLabel?: string | null;
  /** Tunis-formatted moment closing becomes normally available. */
  allowedAtLabel?: string | null;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // An early close is offered ONLY to an Administrator, and only as an
  // explicitly-confirmed override. Everyone else gets a disabled button and is
  // told when it opens up — the action refuses them regardless of what the
  // client sends, so this is signposting, not the enforcement.
  const blocked = tooEarly && !canForceClose;
  const forcing = tooEarly && canForceClose;

  function doClose() {
    setError(null);
    startTransition(async () => {
      // `forcing` is passed through as the caller's explicit intent. The server
      // refuses an early close without it, even for an Administrator.
      const res = await closeInterviewNoteAction(
        campaignId,
        applicantId,
        forcing,
      );
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
        disabled={pending || blocked}
        onClick={() => setDialogOpen(true)}
        title={
          blocked && allowedAtLabel
            ? `This interview hasn't happened yet — closing opens up at ${allowedAtLabel}.`
            : undefined
        }
        className="border-status-rejected/40 text-status-rejected hover:bg-status-rejected/10"
      >
        <Icon name="lock" className="text-[16px]" />
        {forcing ? "Force Close Interview" : "Close Interview"}
      </Button>

      {/* Why it's disabled, in text rather than only a title attribute — a
          disabled button with no visible reason reads as a bug. */}
      {blocked && allowedAtLabel && (
        <span className="max-w-xs text-right text-xs text-neutral-500 dark:text-neutral-400">
          {scheduledLabel
            ? `Scheduled for ${scheduledLabel}. You can close this note from ${allowedAtLabel}.`
            : `You can close this note from ${allowedAtLabel}.`}
        </span>
      )}

      {error && <span className="text-xs text-status-rejected">{error}</span>}

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={
          forcing ? "Force close before the interview?" : "Close this interview note?"
        }
        description={
          forcing ? (
            <>
              This interview is scheduled for{" "}
              <strong>{scheduledLabel ?? "a later time"}</strong>, which
              hasn&apos;t passed yet — force close anyway?
              <br />
              <br />
              Closing locks the note. This override is recorded in the activity
              log as a force close, separately from an ordinary one.
            </>
          ) : (
            <>
              Closing locks the note. After this you&apos;ll{" "}
              <strong>no longer be able to view or edit it</strong> — only an
              account manager can reopen it or see it again. Any scores and
              remarks already entered are kept.
            </>
          )
        }
        confirmLabel={forcing ? "Force close anyway" : "Close interview"}
        destructive
        onConfirm={doClose}
      />
    </div>
  );
}

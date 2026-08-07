"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The app's one confirmation dialog, in two modes.
 *
 * Default: a single click on the confirm button, which closes the dialog itself.
 *
 * Type-to-confirm: pass `confirmPhrase` and the confirm button stays disabled
 * until the user has typed that exact phrase — the GitHub repo-deletion gate,
 * for actions where an accidental click is unrecoverable. In this mode the
 * dialog does NOT close itself: the action is async and can fail, so the caller
 * closes it on success and feeds a server error back through `error`, rather
 * than the dialog vanishing and taking the message with it.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  confirmPhrase,
  error,
  pending = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  /** Enables type-to-confirm. The user must type this exactly. */
  confirmPhrase?: string;
  /** Server-side failure to surface, type-to-confirm mode only. */
  error?: string | null;
  /** Disables both buttons while the action is in flight. */
  pending?: boolean;
  /** Extra content between the description and the confirm input. */
  children?: React.ReactNode;
}) {
  const [typed, setTyped] = useState("");

  // Every close routes through here — Cancel, Escape, backdrop, and a completed
  // action — so a half-typed phrase can never survive into the next opening.
  // Done on the handler rather than in an effect keyed on `open`, which would
  // set state during render.
  function handleOpenChange(next: boolean) {
    if (!next) setTyped("");
    onOpenChange(next);
  }

  const matches = confirmPhrase !== undefined && typed === confirmPhrase;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        {children}

        {confirmPhrase !== undefined && (
          <div className="space-y-3 text-left">
            <div className="space-y-1.5">
              <label
                htmlFor="confirm-phrase"
                className="block text-sm text-muted-foreground"
              >
                Type{" "}
                <strong className="text-foreground">{confirmPhrase}</strong> to
                confirm:
              </label>
              <input
                id="confirm-phrase"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-status-rejected focus:ring-2 focus:ring-status-rejected/20 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </div>
            {error && <p className="text-sm text-status-rejected">{error}</p>}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          {confirmPhrase === undefined ? (
            <AlertDialogAction
              variant={destructive ? "destructive" : "default"}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </AlertDialogAction>
          ) : (
            <Button
              variant={destructive ? "destructive" : "default"}
              disabled={!matches || pending}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

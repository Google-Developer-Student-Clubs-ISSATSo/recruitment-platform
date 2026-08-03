"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app-shell/icon";
import type { SeatApprovalItem } from "@/lib/seat-approval-inbox";
import { answerSeatApprovalAction } from "@/app/(app)/actions";

/**
 * The seat request prompt: one modal, answered where the lead already is.
 *
 * A request has no email and no link behind it — it reaches its approver by
 * them being signed in and it being theirs to answer. So it has to interrupt,
 * or it would sit unanswered until that lead happened to open the right
 * campaign's interviews page.
 *
 * Not dismissible by clicking away — a backdrop click would read as "later"
 * while actually meaning nothing — but "Not now" is offered explicitly. A lead
 * who is in the middle of something else must be able to get out of the way of
 * a modal they didn't ask for; it returns on the next navigation, which is
 * enough to make sure a request isn't quietly lost. Decline stays a real,
 * separate answer: declining is not the same as deferring, and the requester
 * finds out either way.
 *
 * Several pending requests queue rather than stack: answering one advances to
 * the next, so a lead who returns to a busy board works through them in order
 * instead of meeting a pile.
 */
export function SeatApprovalDialog({ items }: { items: SeatApprovalItem[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [deferred, setDeferred] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const item = items[index];
  if (!item || deferred) return null;

  function answer(approve: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await answerSeatApprovalAction(item.requestId, approve);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Advance locally, then refresh: the server is the source of truth for
      // what is still pending, and a refresh re-renders this with the request
      // just answered already gone.
      setIndex((i) => i + 1);
      router.refresh();
    });
  }

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <span className="flex items-center gap-2">
              <Icon
                name="event_seat"
                className="text-[20px] text-[color:var(--status-pending)]"
              />
              Panel seat request
            </span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            {item.forSelf ? (
              <>
                <strong>{item.requestedByName}</strong> is asking to sit in the{" "}
                <strong>{item.seatKindLabel}</strong> seat on{" "}
                <strong>{item.applicantName}</strong>&apos;s interview panel.
              </>
            ) : (
              <>
                <strong>{item.requestedByName}</strong> is asking to put{" "}
                <strong>{item.assigneeName}</strong> in the{" "}
                <strong>{item.seatKindLabel}</strong> seat on{" "}
                <strong>{item.applicantName}</strong>&apos;s interview panel.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {item.campaignName}
          {items.length > 1 && (
            <>
              {" · "}
              Request {index + 1} of {items.length}
            </>
          )}
        </p>

        {error && (
          <p className="rounded-lg bg-status-rejected/10 px-3 py-2 text-xs text-status-rejected">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => setDeferred(true)}
          >
            Not now
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => answer(false)}
          >
            Decline
          </Button>
          <Button disabled={pending} onClick={() => answer(true)}>
            Approve
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

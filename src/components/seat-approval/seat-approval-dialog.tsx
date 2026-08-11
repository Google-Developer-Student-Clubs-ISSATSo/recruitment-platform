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
 *
 * THE QUEUE IS TRACKED BY REQUEST ID, NOT BY POSITION, and that is load-bearing.
 * `items` holds only what is still PENDING on the server, so answering one and
 * refreshing makes the list shrink FROM THE FRONT. An index into that list is
 * therefore pointing at a moving target: advancing it while the list slides
 * back underneath skips exactly one request per answer — with two pending, the
 * second became `items[1]` of a 1-length array, i.e. `undefined`, and the whole
 * modal unmounted while that request was still genuinely PENDING and unanswered
 * (it reappeared only on the next full page load). Filtering out the ids this
 * session has already answered is immune to that: it removes precisely the
 * answered ones however the list moves.
 */
export function SeatApprovalDialog({ items }: { items: SeatApprovalItem[] }) {
  const router = useRouter();
  const [answeredIds, setAnsweredIds] = useState<string[]>([]);
  const [deferred, setDeferred] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Also covers the gap between the action resolving and the refreshed props
  // arriving: without it the just-answered request would still be on screen,
  // with live buttons, for that window.
  const queue = items.filter((i) => !answeredIds.includes(i.requestId));
  const item = queue[0];
  if (!item || deferred) return null;

  function answer(approve: boolean) {
    setError(null);
    const answeredId = item.requestId;
    startTransition(async () => {
      const result = await answerSeatApprovalAction(answeredId, approve);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Drop this ONE id, then refresh. The server stays the source of truth
      // for what is still pending; once it re-renders, the answered request is
      // gone from `items` and this filter entry is simply inert.
      setAnsweredIds((prev) => [...prev, answeredId]);
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

        {/* Counts what is still WAITING rather than "request N of M". With the
            queue keyed by id, the current request is always the head of the
            remaining list, so a position would be a constant 1 and the total
            would shrink under it — "Request 1 of 2" then "Request 1 of 1"
            reads like a miscount. How many are left is the honest version of
            the same information, and it stays correct as the list shrinks. */}
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {item.campaignName}
          {queue.length > 1 && (
            <>
              {" · "}
              {queue.length - 1} more waiting
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

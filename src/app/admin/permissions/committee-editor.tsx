"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/app-shell/icon";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Committee } from "@/generated/prisma/enums";

import { updateUserCommittee, type CommitteeImpact } from "./actions";
import { COMMITTEES } from "./permission-config";

/**
 * Change one member's home committee, from inside the expanded permission
 * editor.
 *
 * The warning is not a generic "are you sure": the action returns the exact
 * lead titles, panel seats and pending invites the change makes the member
 * ineligible for, and this renders that list. It never blocks — it exists so
 * the consequence is seen, not prevented.
 */
export function CommitteeEditor({
  userId,
  userName,
  committee,
}: {
  userId: string;
  userName: string;
  committee: Committee;
}) {
  const [selected, setSelected] = useState<Committee>(committee);
  const [impacts, setImpacts] = useState<CommitteeImpact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = selected !== committee;

  function submit(confirmed: boolean) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateUserCommittee(userId, selected, confirmed);
      if (res.ok) {
        setImpacts(null);
        setSaved(true);
        return;
      }
      if (res.needsConfirmation) {
        setImpacts(res.impacts);
        return;
      }
      setError(res.error);
    });
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-neutral-200 pb-5 dark:border-neutral-800">
      <label
        htmlFor={`committee-${userId}`}
        className="text-[13px] font-medium text-foreground"
      >
        Home committee
      </label>
      <select
        id={`committee-${userId}`}
        value={selected}
        disabled={pending}
        onChange={(e) => {
          setSelected(e.target.value as Committee);
          setSaved(false);
          setError(null);
        }}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950"
      >
        {COMMITTEES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        onClick={() => submit(false)}
        disabled={pending || !dirty}
      >
        {pending ? "Saving…" : "Change committee"}
      </Button>

      {saved && !pending && (
        <span className="flex items-center gap-1 text-sm text-status-accepted">
          <Icon name="check" className="text-[16px]" />
          Saved
        </span>
      )}
      {error && (
        <span className="flex items-center gap-1 text-sm text-status-rejected">
          <Icon name="error" className="text-[16px]" />
          {error}
        </span>
      )}

      <ConfirmDialog
        open={impacts !== null}
        onOpenChange={(open) => !open && setImpacts(null)}
        title={`Move ${userName} to ${selected}?`}
        description={
          <>
            {userName} currently holds{" "}
            {impacts?.length === 1 ? "something" : "things"} that this change
            makes them ineligible for:
          </>
        }
        confirmLabel="Change committee anyway"
        cancelLabel="Keep current committee"
        destructive
        pending={pending}
        onConfirm={() => submit(true)}
      >
        <ul className="space-y-2 rounded-lg border border-status-pending/30 bg-status-pending/10 p-3 text-left text-sm text-foreground">
          {impacts?.map((impact, i) => (
            <li key={i} className="flex gap-2">
              <Icon
                name="warning"
                className="mt-0.5 shrink-0 text-[16px] text-[color:var(--status-pending)]"
              />
              <span>{impact.description}</span>
            </li>
          ))}
        </ul>
        <p className="text-left text-xs text-neutral-500 dark:text-neutral-400">
          Nothing above is undone automatically: a lead keeps their title and
          everything it can do until someone reassigns it, and anyone already
          seated on a panel stays seated. What changes is that they can no
          longer be appointed or seated there again. Reassign from the
          campaign&rsquo;s Configuration or Interviews page if that isn&rsquo;t
          what you want.
        </p>
      </ConfirmDialog>
    </div>
  );
}

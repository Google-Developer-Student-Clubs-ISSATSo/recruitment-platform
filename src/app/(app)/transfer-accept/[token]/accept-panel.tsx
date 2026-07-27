"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/app-shell/icon";
import { acceptTransferInvite } from "@/app/admin/transfer-admin/actions";

/**
 * Recipient-side half of the admin transfer. The page has already validated the
 * token server-side and only renders this when the invite is genuinely
 * acceptable by the signed-in member; this component owns the confirm step and
 * the outcome message.
 *
 * Accepting is irreversible from the platform's side (the old Administrator
 * cannot take the role back without a fresh invite), so it goes through
 * ConfirmDialog like every other high-consequence action in the app.
 */
export function AcceptPanel({
  token,
  initiatorName,
}: {
  token: string;
  initiatorName: string;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptTransferInvite(token);
      if (result.ok) {
        setDone(true);
        // The shell's admin controls are permission-derived, so a refresh is
        // what makes the newly granted access actually appear.
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-xl border border-status-accepted/30 bg-status-accepted/5 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-status-accepted">
          <Icon name="check_circle" className="text-[22px]" />
          You are now the Administrator
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          The TM Lead role has been transferred to your account and{" "}
          {initiatorName} has been downgraded to TM Reviewer. Admin Settings is
          now available in your sidebar.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <Icon name="key" className="text-[20px]" />
          {pending ? "Accepting…" : "Accept the Administrator role"}
        </button>
        {error && <span className="text-sm text-status-rejected">{error}</span>}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Accept the Administrator role?"
        description={
          <>
            You will take over the <strong>TM Lead</strong> role and full admin
            permissions. <strong>{initiatorName}</strong> will be downgraded to
            TM Reviewer immediately. This can only be undone by a new transfer
            invite from you.
          </>
        }
        confirmLabel="Accept the role"
        onConfirm={accept}
      />
    </>
  );
}

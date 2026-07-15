"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/app-shell/icon";
import {
  cancelTransferInvite,
  createTransferInvite,
  type TransferInviteState,
} from "./actions";

export type PendingInvite = {
  id: string;
  invitedEmail: string;
  createdAtISO: string;
  initiatorName: string;
};

const initial: TransferInviteState = { status: "idle" };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function TransferForm({ pending }: { pending: PendingInvite[] }) {
  const [state, action, submitting] = useActionState(createTransferInvite, initial);
  const [busy, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [cancelTarget, setCancelTarget] = useState<PendingInvite | null>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  // Gate the invite behind a confirmation. Run native field validation first
  // so we never confirm an invalid email; on confirm, submit the real form so
  // the useActionState flow (and server validation) still runs.
  function requestSend() {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const email = new FormData(form).get("email");
    setPendingEmail(typeof email === "string" ? email : "");
    setSendConfirmOpen(true);
  }

  function cancel(invite: PendingInvite) {
    setCancelTarget(invite);
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Breadcrumb */}
      <div className="mb-8 flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
        <span className="text-sm">Admin Settings</span>
        <Icon name="chevron_right" className="text-[16px]" />
        <span className="text-sm font-bold text-primary">Role Transfer</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="p-8">
          <div className="flex items-start gap-6">
            <div className="rounded-xl bg-primary/10 p-4">
              <Icon name="key" className="text-[40px] text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="mb-2 text-2xl font-semibold text-foreground">
                Transfer Ownership
              </h2>
              <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
                Hand over the TM Lead privileges to another qualified member.
                This process is permanent and will downgrade your account upon
                completion.
              </p>
            </div>
          </div>

          <div className="mb-8 mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-950/40">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
              <Icon name="info" className="text-[18px] text-status-rejected" />
              What happens next?
            </h4>
            <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400">
              {[
                "The recipient will receive an invitation to accept the role.",
                "They must verify their identity and accept the transfer within 48 hours.",
                "Once accepted, your permissions will be adjusted immediately.",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-primary">•</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Invite form */}
          <form ref={formRef} action={action} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-xs font-semibold uppercase tracking-wider text-foreground"
              >
                New Admin Email Address
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">
                  <Icon name="mail" />
                </span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="name@gdgc-issatso.dev"
                  className="w-full rounded-lg border border-neutral-300 bg-white py-3 pl-12 pr-4 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="max-w-xs text-[11px] text-neutral-500 dark:text-neutral-400">
                By clicking “Send Invite”, you confirm that you have verified the
                recipient’s identity and eligibility.
              </p>
              <div className="flex items-center gap-3">
                {state.status === "error" && (
                  <span className="text-sm text-status-rejected">{state.message}</span>
                )}
                {state.status === "success" && (
                  <span className="text-sm text-status-accepted">{state.message}</span>
                )}
                <button
                  type="button"
                  onClick={requestSend}
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  <Icon name="send" className="text-[20px]" />
                  {submitting ? "Sending…" : "Send Invite"}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Pending requests */}
        <div className="border-t border-neutral-200 bg-neutral-50 px-8 py-6 dark:border-neutral-800 dark:bg-neutral-950/40">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Pending Transfer Requests
          </h3>
          {pending.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-neutral-200 py-6 text-center text-sm italic text-neutral-400 dark:border-neutral-800">
              No pending transfer requests at this time.
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex items-center gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-status-accepted/10 text-status-accepted">
                      <Icon name="person" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {inv.invitedEmail}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-status-accepted" />
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          Waiting for acceptance • Sent {timeAgo(inv.createdAtISO)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => cancel(inv)}
                    disabled={busy}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-status-rejected transition-colors hover:bg-status-rejected/10 disabled:opacity-50"
                  >
                    <Icon name="cancel" className="text-[18px]" />
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Warning footer */}
      <div className="mt-8 flex items-center gap-4 rounded-xl border border-status-rejected/30 bg-status-rejected/5 p-4">
        <Icon name="security" className="text-status-rejected" />
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Security Tip: Only initiate a transfer to a trusted lead. This action
          is logged and cannot be undone by the platform automatically.
        </p>
      </div>

      {/* Sending an admin-transfer invite is high-consequence — confirm first. */}
      <ConfirmDialog
        open={sendConfirmOpen}
        onOpenChange={setSendConfirmOpen}
        title="Send Transfer Admin Role invite?"
        description={
          <>
            This invites <strong>{pendingEmail}</strong> to take over the TM
            Lead role. They can then accept and assume admin privileges. This
            action is logged.
          </>
        }
        confirmLabel="Send Invite"
        onConfirm={() => formRef.current?.requestSubmit()}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title="Cancel this transfer invite?"
        description={
          cancelTarget ? (
            <>
              The pending invite for <strong>{cancelTarget.invitedEmail}</strong>{" "}
              will be cancelled.
            </>
          ) : null
        }
        confirmLabel="Cancel Invite"
        cancelLabel="Keep Invite"
        destructive
        onConfirm={() => {
          const id = cancelTarget?.id;
          if (!id) return;
          startTransition(async () => {
            await cancelTransferInvite(id);
          });
        }}
      />
    </div>
  );
}

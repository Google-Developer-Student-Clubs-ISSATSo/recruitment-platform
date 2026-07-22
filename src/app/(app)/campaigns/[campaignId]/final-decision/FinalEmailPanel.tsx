"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/app-shell/icon";
import { sendFinalResultsAction } from "./actions";
import type { SendFailure } from "@/lib/final-email-batch";

type Summary = {
  sent: number;
  failed: number;
  skipped: number;
  failures: SendFailure[];
};

/**
 * The final-results send, shown once the decisions are signed off.
 *
 * Two independent gates stand in front of the button, and both explain
 * themselves rather than just greying it out: the caller must hold SEND_EMAILS
 * (`canSend`), and all four external links must be configured
 * (`missingLinkLabels`) — the same disabled-with-message pattern the interview
 * booking panel uses for its calendar link. The batch re-checks both server-side.
 */
export function FinalEmailPanel({
  campaignId,
  canSend,
  acceptedCount,
  rejectedCount,
  alreadySent,
  missingLinkLabels,
}: {
  campaignId: string;
  canSend: boolean;
  acceptedCount: number;
  rejectedCount: number;
  alreadySent: number;
  missingLinkLabels: string[];
}) {
  const [dialog, setDialog] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Summary | null>(null);

  const total = acceptedCount + rejectedCount;
  const pendingCount = Math.max(0, total - alreadySent);
  const needsLinks = missingLinkLabels.length > 0;
  const blocked = !canSend || needsLinks || pendingCount === 0;

  function send() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await sendFinalResultsAction(campaignId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult({
        sent: res.sent,
        failed: res.failed,
        skipped: res.skipped,
        failures: res.failures,
      });
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="mail" className="text-[20px]" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Final Result Emails
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Send every accepted applicant their offer and every rejected
            applicant their outcome.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-6 text-sm">
        <Stat label="Acceptances" value={acceptedCount} />
        <Stat label="Rejections" value={rejectedCount} />
        <Stat label="Already sent" value={alreadySent} />
      </div>

      {needsLinks && (
        <div className="flex items-start gap-2 rounded-lg border border-status-pending/40 bg-status-pending/10 px-4 py-3 text-sm">
          <Icon
            name="warning"
            className="text-[18px] text-status-pending shrink-0"
          />
          <p className="text-foreground">
            Set{" "}
            <strong>{missingLinkLabels.join(", ")}</strong> in{" "}
            <Link
              href={`/campaigns/${campaignId}/configuration`}
              className="font-semibold text-primary underline underline-offset-2"
            >
              Configuration
            </Link>{" "}
            before sending — the emails link to {missingLinkLabels.length === 1 ? "it" : "them"}.
          </p>
        </div>
      )}

      {!canSend && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          You don&apos;t have permission to send emails. Ask someone with the
          Send Emails permission to run this.
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-status-rejected/30 bg-status-rejected/10 px-4 py-3 text-sm font-medium text-status-rejected">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-status-accepted/30 bg-status-accepted/10 px-4 py-3 text-sm">
          <p className="font-semibold text-status-accepted">
            {result.sent} sent
            {result.failed > 0 ? `, ${result.failed} failed` : ""}
            {result.skipped > 0
              ? `, ${result.skipped} skipped (already emailed)`
              : ""}
            .
          </p>
          {result.failures.length > 0 && (
            <ul className="mt-2 space-y-1 text-neutral-600 dark:text-neutral-400">
              {result.failures.map((f) => (
                <li key={f.email}>
                  {f.name} ({f.email}) — {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          disabled={pending || blocked}
          onClick={() => setDialog(true)}
        >
          <Icon name="send" className="text-[18px]" />
          {pending ? "Sending…" : "Send Final Results"}
        </Button>
        {pendingCount === 0 && total > 0 && canSend && !needsLinks && (
          <span className="flex items-center gap-1 text-sm text-status-accepted">
            <Icon name="check" className="text-[16px]" />
            Everyone has been emailed.
          </span>
        )}
      </div>

      <ConfirmDialog
        open={dialog}
        onOpenChange={setDialog}
        title="Send final result emails?"
        description={
          <>
            This will email <strong>{acceptedCount} acceptances</strong> and{" "}
            <strong>{rejectedCount} rejections</strong>. Continue?
            {alreadySent > 0 && (
              <>
                {" "}
                Anyone already emailed is skipped, so {pendingCount} message
                {pendingCount === 1 ? "" : "s"} will actually go out.
              </>
            )}
          </>
        }
        confirmLabel="Send emails"
        onConfirm={send}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

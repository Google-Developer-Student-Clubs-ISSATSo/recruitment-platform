"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/app-shell/icon";
import { setGdgDayDetailsAction, sendPhaseOneEmailsAction } from "./actions";

type Tally = { total: number; sent: number };
type SendFailure = { name: string; email: string; error: string };
type SendSummary = { sent: number; failed: number; skipped: number; failures: SendFailure[] };

/** UTC-derived so server and client agree — no hydration mismatch. */
function formatSentAt(iso: string): string {
  const [date, rest] = iso.split("T");
  return `${date} at ${(rest ?? "").slice(0, 5)} UTC`;
}

/**
 * Phase 1 result-email panel. Only mounted once the phase is finalized. Owns
 * the GDG Day details form (a prerequisite for acceptance emails), the gated
 * batch-send button, duplicate-send prevention, and the resend override.
 */
export function EmailPanel({
  campaignId,
  canSendEmails,
  gdgDayInputValue,
  gdgDayDisplay,
  gdgDayLocation,
  acceptance,
  rejection,
  lastSentAtISO,
}: {
  campaignId: string;
  canSendEmails: boolean;
  gdgDayInputValue: string | null;
  gdgDayDisplay: string | null;
  gdgDayLocation: string | null;
  acceptance: Tally;
  rejection: Tally;
  lastSentAtISO: string | null;
}) {
  const gdgDaySet = gdgDayInputValue !== null && gdgDayLocation !== null;

  const [editing, setEditing] = useState(!gdgDaySet);
  const [dateTime, setDateTime] = useState(gdgDayInputValue ?? "");
  const [location, setLocation] = useState(gdgDayLocation ?? "");

  const [dialog, setDialog] = useState<null | "send" | "resend">(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<SendSummary | null>(null);

  const acceptancePending = acceptance.total - acceptance.sent;
  const rejectionPending = rejection.total - rejection.sent;
  const pendingTotal = acceptancePending + rejectionPending;
  const totalRecipients = acceptance.total + rejection.total;
  const anySent = acceptance.sent > 0 || rejection.sent > 0;
  const needsGdgDay = acceptance.total > 0 && !gdgDaySet;

  function saveGdgDay() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await setGdgDayDetailsAction(campaignId, dateTime, location);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      setNotice("GDG Day details saved.");
    });
  }

  function send(resend: boolean) {
    setError(null);
    setNotice(null);
    setResult(null);
    startTransition(async () => {
      const res = await sendPhaseOneEmailsAction(campaignId, { resend });
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
    <div className="space-y-5 rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="mail" className="text-[20px]" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Phase 1 Result Emails
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Email each shortlisted applicant their GDG Day invitation and each
            rejected applicant the Phase 1 outcome.
          </p>
        </div>
      </div>

      {/* GDG Day details */}
      <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">GDG Day details</h3>
          {gdgDaySet && !editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Icon name="edit" className="text-[16px]" />
              Edit
            </Button>
          )}
        </div>

        {gdgDaySet && !editing ? (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            <span className="font-medium text-foreground">{gdgDayDisplay}</span>{" "}
            at <span className="font-medium text-foreground">{gdgDayLocation}</span>
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {needsGdgDay && (
              <p className="text-xs text-[color:var(--status-pending)]">
                Required before acceptance emails can be sent.
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex-1 space-y-1">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Date &amp; time (Tunis)
                </span>
                <input
                  type="datetime-local"
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-foreground dark:border-neutral-700 dark:bg-neutral-900"
                />
              </label>
              <label className="flex-1 space-y-1">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Location
                </span>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. ISSATSo, Cité Taffala, Sousse"
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-foreground dark:border-neutral-700 dark:bg-neutral-900"
                />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={pending || !dateTime || !location.trim()}
                onClick={saveGdgDay}
              >
                Save details
              </Button>
              {gdgDaySet && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setEditing(false);
                    setDateTime(gdgDayInputValue ?? "");
                    setLocation(gdgDayLocation ?? "");
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-status-rejected/10 px-4 py-2 text-sm text-status-rejected">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-primary/10 px-4 py-2 text-sm text-primary">
          {notice}
        </p>
      )}

      {/* Recipient summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <RecipientCard
          icon="how_to_reg"
          label="Acceptances"
          total={acceptance.total}
          sent={acceptance.sent}
        />
        <RecipientCard
          icon="do_not_disturb_on"
          label="Rejections"
          total={rejection.total}
          sent={rejection.sent}
        />
      </div>

      {/* Send controls */}
      {totalRecipients === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No shortlisted or rejected applicants to email.
        </p>
      ) : pendingTotal > 0 ? (
        <div className="flex flex-col items-start gap-2">
          <Button
            size="lg"
            disabled={!canSendEmails || needsGdgDay || pending}
            title={
              !canSendEmails
                ? "Requires the SEND_EMAILS permission"
                : needsGdgDay
                  ? "Set GDG Day details first"
                  : "Send Phase 1 result emails"
            }
            onClick={() => setDialog("send")}
          >
            <Icon name="send" className="text-[18px]" />
            Send Phase 1 Results
          </Button>
          {!canSendEmails && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              You don&apos;t have permission to send Phase 1 result emails.
            </span>
          )}
          {canSendEmails && needsGdgDay && (
            <span className="text-xs text-[color:var(--status-pending)]">
              Set the GDG Day details above before sending acceptance emails.
            </span>
          )}
          {canSendEmails && anySent && !needsGdgDay && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {pendingTotal} recipient{pendingTotal === 1 ? "" : "s"} haven&apos;t
              been emailed yet (earlier sends are skipped automatically).
            </span>
          )}
        </div>
      ) : (
        // Everyone already has a SENT log — the duplicate-send guard.
        <div className="flex flex-col items-start gap-2 rounded-lg border border-status-accepted/30 bg-status-accepted/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-status-accepted">
            <Icon name="task_alt" className="text-[18px]" />
            Phase 1 emails already sent
            {lastSentAtISO ? ` on ${formatSentAt(lastSentAtISO)}` : ""}.
          </p>
          {canSendEmails && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setDialog("resend")}
            >
              <Icon name="forward_to_inbox" className="text-[16px]" />
              Resend to everyone
            </Button>
          )}
        </div>
      )}

      {/* Send results */}
      {result && (
        <div className="space-y-2 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p className="font-medium text-foreground">
            <span className="text-status-accepted">{result.sent} sent successfully</span>
            {", "}
            <span className={result.failed > 0 ? "text-status-rejected" : "text-neutral-500"}>
              {result.failed} failed
            </span>
            {result.skipped > 0 && (
              <span className="text-neutral-500">
                {" "}
                ({result.skipped} already sent, skipped)
              </span>
            )}
            .
          </p>
          {result.failures.length > 0 && (
            <ul className="space-y-1 text-xs text-status-rejected">
              {result.failures.map((f) => (
                <li key={f.email}>
                  {f.name} ({f.email}) — {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Confirm: first send */}
      <ConfirmDialog
        open={dialog === "send"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Send Phase 1 results?"
        description={
          <>
            This will email <strong>{acceptancePending}</strong> acceptance
            {acceptancePending === 1 ? "" : "s"} and{" "}
            <strong>{rejectionPending}</strong> rejection
            {rejectionPending === 1 ? "" : "s"}. Continue?
          </>
        }
        confirmLabel="Send emails"
        onConfirm={() => send(false)}
      />

      {/* Confirm: explicit resend to everyone */}
      <ConfirmDialog
        open={dialog === "resend"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Resend to everyone?"
        description={
          <>
            This re-emails <strong>all {acceptance.total}</strong> acceptance
            {acceptance.total === 1 ? "" : "s"} and{" "}
            <strong>{rejection.total}</strong> rejection
            {rejection.total === 1 ? "" : "s"}, including applicants who were
            already emailed. Continue?
          </>
        }
        confirmLabel="Resend to everyone"
        destructive
        onConfirm={() => send(true)}
      />
    </div>
  );
}

function RecipientCard({
  icon,
  label,
  total,
  sent,
}: {
  icon: string;
  label: string;
  total: number;
  sent: number;
}) {
  const pending = total - sent;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
        <Icon name={icon} className="text-[18px]" />
      </span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
          {label}
        </p>
        <p className="text-sm font-semibold text-foreground">
          {total} recipient{total === 1 ? "" : "s"}
          {sent > 0 && (
            <span className="font-normal text-neutral-500 dark:text-neutral-400">
              {" "}
              · {sent} sent, {pending} pending
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

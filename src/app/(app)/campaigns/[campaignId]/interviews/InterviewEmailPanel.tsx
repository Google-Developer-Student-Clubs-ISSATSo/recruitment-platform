"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon, type IconName } from "@/components/app-shell/icon";
import {
  sendInterviewInvitesAction,
  sendInterviewRemindersAction,
  setInterviewCalendarLinkAction,
  type SendSummary,
} from "./actions";

/** UTC-derived so server and client agree — no hydration mismatch. */
function formatSentAt(iso: string): string {
  const [date, rest] = iso.split("T");
  return `${date} at ${(rest ?? "").slice(0, 5)} UTC`;
}

/**
 * The two interview booking sends. Both are SEND_EMAILS-gated — a panel member
 * who can open this page (CLAIM_PANEL_SEAT) sees the counts but can't trigger a
 * send.
 *
 * The two buttons differ deliberately. Invites are one-per-applicant, so once
 * everyone has one the button retires itself. Reminders are expected to go out
 * repeatedly through the booking window, so that button stays live as long as
 * anyone is still unbooked.
 */
export function InterviewEmailPanel({
  campaignId,
  calendarLink,
  inviteTotal,
  inviteSent,
  reminderRecipients,
  lastInviteSentAtISO,
  lastReminderSentAtISO,
}: {
  campaignId: string;
  calendarLink: string | null;
  inviteTotal: number;
  inviteSent: number;
  reminderRecipients: number;
  lastInviteSentAtISO: string | null;
  lastReminderSentAtISO: string | null;
}) {
  const [dialog, setDialog] = useState<null | "invite" | "reminder">(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<(SendSummary & { kind: string }) | null>(
    null,
  );

  // Mirrors the GDG Day details form: start in edit mode when unset, otherwise
  // show the saved value with an Edit affordance.
  const [savedLink, setSavedLink] = useState(calendarLink);
  const [editingLink, setEditingLink] = useState(calendarLink === null);
  const [linkDraft, setLinkDraft] = useState(calendarLink ?? "");

  const invitePending = inviteTotal - inviteSent;
  // Neither email makes sense without somewhere to book — the server refuses
  // too, this just stops the click.
  const needsLink = savedLink === null;

  function saveLink() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await setInterviewCalendarLinkAction(campaignId, linkDraft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedLink(res.link);
      setLinkDraft(res.link);
      setEditingLink(false);
      setNotice("Calendar link saved.");
    });
  }

  function send(kind: "invite" | "reminder") {
    setError(null);
    setNotice(null);
    setResult(null);
    startTransition(async () => {
      const res =
        kind === "invite"
          ? await sendInterviewInvitesAction(campaignId)
          : await sendInterviewRemindersAction(campaignId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult({
        kind: kind === "invite" ? "Booking invites" : "Reminders",
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
            Interview Booking Emails
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Send shortlisted applicants the booking calendar link, then chase
            anyone who hasn&apos;t picked a slot.
          </p>
        </div>
      </div>

      {/* Booking calendar link — the destination both emails send people to. */}
      <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            Booking calendar link
          </h3>
          {savedLink !== null && !editingLink && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingLink(true)}
            >
              <Icon name="edit" className="text-[16px]" />
              Edit
            </Button>
          )}
        </div>

        {savedLink !== null && !editingLink ? (
          <a
            href={savedLink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block truncate text-sm font-medium text-primary underline underline-offset-2"
          >
            {savedLink}
          </a>
        ) : (
          <div className="mt-3 space-y-3">
            {needsLink && (
              <p className="text-xs text-[color:var(--status-pending)]">
                Required before any booking email can be sent.
              </p>
            )}
            <input
              type="url"
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              placeholder="https://bit.ly/your-booking-link"
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-foreground dark:border-neutral-700 dark:bg-neutral-900"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={pending || !linkDraft.trim()}
                onClick={saveLink}
              >
                Save link
              </Button>
              {savedLink !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setEditingLink(false);
                    setLinkDraft(savedLink);
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

      <div className="grid gap-3 sm:grid-cols-2">
        <TallyCard
          icon="outgoing_mail"
          label="Booking invites"
          headline={`${inviteTotal} shortlisted`}
          detail={
            inviteTotal === 0
              ? "Nobody to invite yet"
              : invitePending === 0
                ? `All ${inviteTotal} invited`
                : `${inviteSent} invited, ${invitePending} pending`
          }
          lastSentISO={lastInviteSentAtISO}
        />
        <TallyCard
          icon="notifications_active"
          label="Reminders"
          headline={`${reminderRecipients} still unbooked`}
          detail={
            reminderRecipients === 0
              ? "Everyone invited has booked"
              : "Would receive the next reminder"
          }
          lastSentISO={lastReminderSentAtISO}
        />
      </div>

      <div className="flex flex-col items-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="lg"
            disabled={pending || needsLink || invitePending === 0}
            title={
              needsLink
                ? "Set the calendar link before sending"
                : invitePending === 0
                  ? "Every shortlisted applicant has already been invited"
                  : "Send interview booking invites"
            }
            onClick={() => setDialog("invite")}
          >
            <Icon name="send" className="text-[18px]" />
            Send Interview Booking Invites
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={pending || needsLink || reminderRecipients === 0}
            title={
              needsLink
                ? "Set the calendar link before sending"
                : reminderRecipients === 0
                  ? "Nobody is waiting to book"
                  : "Send a booking reminder"
            }
            onClick={() => setDialog("reminder")}
          >
            <Icon name="forward_to_inbox" className="text-[18px]" />
            Send Reminder
          </Button>
        </div>

        {needsLink ? (
          <span className="flex items-center gap-1.5 text-xs text-[color:var(--status-pending)]">
            <Icon name="warning" className="text-[14px]" />
            Set the calendar link before sending.
          </span>
        ) : (
          <>
            {inviteTotal > 0 && invitePending === 0 && (
              <span className="flex items-center gap-1.5 text-xs text-status-accepted">
                <Icon name="task_alt" className="text-[14px]" />
                Every shortlisted applicant has been invited
                {lastInviteSentAtISO
                  ? ` (last send ${formatSentAt(lastInviteSentAtISO)})`
                  : ""}
                .
              </span>
            )}
            {reminderRecipients > 0 && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Reminders can be sent more than once — each send goes to whoever
                is still unbooked at that moment.
              </span>
            )}
          </>
        )}
      </div>

      {result && (
        <div className="space-y-2 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p className="font-medium text-foreground">
            {result.kind}:{" "}
            <span className="text-status-accepted">
              {result.sent} sent successfully
            </span>
            {", "}
            <span
              className={
                result.failed > 0 ? "text-status-rejected" : "text-neutral-500"
              }
            >
              {result.failed} failed
            </span>
            {result.skipped > 0 && (
              <span className="text-neutral-500">
                {" "}
                ({result.skipped} already invited, skipped)
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

      <ConfirmDialog
        open={dialog === "invite"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Send interview booking invites?"
        description={
          <>
            This will email the booking calendar link to{" "}
            <strong>{invitePending}</strong> shortlisted applicant
            {invitePending === 1 ? "" : "s"}
            {inviteSent > 0 && <> ({inviteSent} already invited, skipped)</>}
            . Continue?
          </>
        }
        confirmLabel="Send invites"
        onConfirm={() => send("invite")}
      />

      <ConfirmDialog
        open={dialog === "reminder"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Send booking reminder?"
        description={
          <>
            This will email a reminder to the{" "}
            <strong>{reminderRecipients}</strong> applicant
            {reminderRecipients === 1 ? "" : "s"} who
            {reminderRecipients === 1 ? " hasn't" : " haven't"} booked a slot
            yet. Anyone already scheduled is excluded. Continue?
          </>
        }
        confirmLabel="Send reminder"
        onConfirm={() => send("reminder")}
      />
    </div>
  );
}

function TallyCard({
  icon,
  label,
  headline,
  detail,
  lastSentISO,
}: {
  icon: IconName;
  label: string;
  headline: string;
  detail: string;
  lastSentISO: string | null;
}) {
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
          {headline}{" "}
          <span className="font-normal text-neutral-500 dark:text-neutral-400">
            · {detail}
          </span>
        </p>
        {lastSentISO && (
          <p className="text-xs text-neutral-400">
            Last sent {formatSentAt(lastSentISO)}
          </p>
        )}
      </div>
    </div>
  );
}

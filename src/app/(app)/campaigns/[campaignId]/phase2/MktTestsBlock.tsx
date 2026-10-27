"use client";

import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/app-shell/icon";
import { splitTimestamp } from "@/lib/activity-descriptions";
import {
  MKT_TEST_LINK_MAX_LENGTH,
  MKT_TESTS,
  normalizeMktTestLink,
  type MktTests,
} from "@/lib/phase2";
import type { MktTestKind } from "@/generated/prisma/enums";
import { removeMktTestLinkAction, setMktTestLinkAction } from "./actions";

/**
 * The marketing test, for the MKT committee: one row per test, each either the
 * Drive link to the applicant's work or a clear "Not submitted". There is no
 * grade — whether the work exists is the whole record.
 *
 * Only rendered when the server sent `mktTests` at all (MKT members and the
 * Administrator, for applicants who listed an MKT skill), so everyone who sees
 * it may also edit it.
 */
export function MktTestsBlock({
  campaignId,
  applicantId,
  applicantName,
  tests,
}: {
  campaignId: string;
  applicantId: string;
  applicantName: string;
  tests: MktTests;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">Marketing test</p>
      <ul className="mt-1.5 divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {MKT_TESTS.map((t) => (
          <MktTestRow
            key={t.kind}
            campaignId={campaignId}
            applicantId={applicantId}
            applicantName={applicantName}
            kind={t.kind}
            label={t.label}
            submission={tests[t.kind]}
          />
        ))}
      </ul>
    </div>
  );
}

function MktTestRow({
  campaignId,
  applicantId,
  applicantName,
  kind,
  label,
  submission,
}: {
  campaignId: string;
  applicantId: string;
  applicantName: string;
  kind: MktTestKind;
  label: string;
  submission: MktTests[MktTestKind];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = `mkt-test-${applicantId}-${kind}`;

  function startEditing() {
    setDraft(submission?.link ?? "");
    setError(null);
    setEditing(true);
  }

  function save() {
    if (pending) return;
    // Checked here too so an obvious typo is caught without a round trip; the
    // action re-validates regardless.
    if (!normalizeMktTestLink(draft)) {
      setError("Paste a full link, starting with https://.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setMktTestLinkAction(
        campaignId,
        applicantId,
        kind,
        draft,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeMktTestLinkAction(
        campaignId,
        applicantId,
        kind,
      );
      if (!result.ok) setError(result.error);
      setConfirmRemove(false);
    });
  }

  const when = submission ? splitTimestamp(submission.updatedAtISO) : null;

  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {submission ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-status-accepted/10 px-2 py-0.5 text-[11px] font-semibold text-status-accepted-text">
              <Icon name="check_circle" className="text-[13px]" />
              Submitted
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-status-pending/15 px-2 py-0.5 text-[11px] font-semibold text-status-pending-text">
              <Icon name="pending" className="text-[13px]" />
              Not submitted
            </span>
          )}
        </span>

        {!editing && (
          <span className="flex items-center gap-1">
            {submission && (
              <a
                href={submission.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary-text hover:bg-primary/10"
              >
                <Icon name="open_in_new" className="text-[14px]" />
                Open
              </a>
            )}
            <button
              type="button"
              onClick={startEditing}
              disabled={pending}
              aria-label={`${submission ? "Change" : "Add"} the ${label.toLowerCase()} link`}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <Icon name={submission ? "edit" : "add"} className="text-[14px]" />
              {submission ? "Change" : "Add link"}
            </button>
            {submission && (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                disabled={pending}
                aria-label={`Remove the ${label.toLowerCase()} link`}
                className="inline-flex items-center rounded-lg p-1 text-neutral-500 hover:bg-status-rejected/10 hover:text-status-rejected-text disabled:opacity-40"
              >
                <Icon name="delete" className="text-[16px]" />
              </button>
            )}
          </span>
        )}
      </div>

      {submission && !editing && when && (
        <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
          Added by {submission.submittedByName} · {when.date}
        </p>
      )}

      {editing && (
        <div className="mt-2">
          <label htmlFor={inputId} className="sr-only">
            {label} Drive link
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={inputId}
              type="url"
              inputMode="url"
              autoComplete="off"
              autoFocus
              value={draft}
              maxLength={MKT_TEST_LINK_MAX_LENGTH}
              placeholder="https://drive.google.com/…"
              disabled={pending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                } else if (e.key === "Escape") {
                  setEditing(false);
                  setError(null);
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-foreground dark:border-neutral-700 dark:bg-neutral-900"
            />
            <span className="flex gap-2">
              <button
                type="button"
                onClick={save}
                disabled={pending || draft.trim() === ""}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-text px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-text/90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-primary dark:text-neutral-950 dark:hover:bg-primary/90"
              >
                <Icon name="check" className="text-[14px]" />
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                disabled={pending}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
            </span>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-1.5 text-xs text-status-rejected-text">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${applicantName}'s ${label.toLowerCase()} link?`}
        description="The test will show as not submitted until a link is added again."
        confirmLabel="Remove link"
        destructive
        pending={pending}
        onConfirm={remove}
      />
    </li>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/app-shell/icon";
import { Button } from "@/components/ui/button";
import { previewImport, confirmImport } from "./actions";
import type { PreviewResult, ConfirmResult } from "./actions";
import type { RowStatus } from "./parse";

// Per-row preview badge styling (distinct from the committed ApplicantStatus
// badge — these describe what WILL happen on import, not a saved status).
const ROW_STATUS: Record<RowStatus, { label: string; className: string }> = {
  import: {
    label: "Will import",
    className: "bg-status-accepted/10 text-status-accepted",
  },
  auto_reject: {
    label: "Auto-rejected (not ISSATSO)",
    className: "bg-status-rejected/10 text-status-rejected",
  },
  duplicate: {
    label: "Duplicate — skipped",
    className:
      "bg-status-pending/15 text-[color:var(--status-pending)]",
  },
  error: {
    label: "Error",
    className: "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300",
  },
};

export function ImportPanel({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setFileName(null);
    setCsvText("");
    setPreview(null);
    setResult(null);
    setLocalError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setPreview(null);
    setLocalError(null);

    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setLocalError("Please choose a .csv file.");
      setFileName(file.name);
      return;
    }
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);

    startTransition(async () => {
      const res = await previewImport(campaignId, text);
      setPreview(res);
    });
  }

  function commit() {
    startTransition(async () => {
      const res = await confirmImport(campaignId, csvText);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  const rows = preview?.ok ? preview.rows : [];
  const summary = preview?.ok ? preview.summary : null;
  const committable = summary ? summary.imported + summary.autoRejected : 0;

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icon name="upload_file" className="text-[18px]" />
        Import CSV
      </Button>

      {open && (
        // A multi-step wizard rather than a confirm dialog, so it keeps its own
        // wide scrollable shell instead of AlertDialogContent's narrow centred
        // popup — but the overlay and surface tokens are the baseline ones, so
        // it reads as the same family of modal as the rest of the app.
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/10 p-4 supports-backdrop-filter:backdrop-blur-xs sm:p-8">
          <div className="w-full max-w-4xl rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 p-5 dark:border-neutral-800">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Import applicants from CSV
                </h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Upload the responses export, review the preview, then confirm.
                  Nothing is saved until you confirm.
                </p>
              </div>
              <button
                onClick={close}
                aria-label="Close"
                className="text-neutral-400 transition-colors hover:text-foreground"
              >
                <Icon name="close" className="text-[22px]" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {/* Step 1: file picker */}
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={onFile}
                  disabled={pending || (result?.ok ?? false)}
                  className="block text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary/90 disabled:opacity-50 dark:text-neutral-300"
                />
                {fileName && (
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {fileName}
                  </span>
                )}
                {pending && (
                  <span className="text-xs text-neutral-500">Working…</span>
                )}
              </div>

              {localError && (
                <p className="rounded-lg bg-status-rejected/10 px-4 py-2 text-sm text-status-rejected">
                  {localError}
                </p>
              )}
              {preview && !preview.ok && (
                <p className="rounded-lg bg-status-rejected/10 px-4 py-2 text-sm text-status-rejected">
                  {preview.error}
                </p>
              )}

              {/* Step 2: summary + preview table */}
              {summary && (
                <>
                  <div className="flex flex-wrap gap-2 text-xs font-medium">
                    <Pill tone="accepted">{summary.imported} will import</Pill>
                    <Pill tone="rejected">
                      {summary.autoRejected} auto-rejected
                    </Pill>
                    <Pill tone="pending">
                      {summary.duplicatesSkipped} duplicate
                    </Pill>
                    <Pill tone="neutral">{summary.errors} error</Pill>
                    <Pill tone="neutral">{summary.totalRows} total rows</Pill>
                  </div>

                  <div className="max-h-[46vh] overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
                        <tr>
                          <th className="px-3 py-2.5">#</th>
                          <th className="px-3 py-2.5">Name</th>
                          <th className="px-3 py-2.5">Email</th>
                          <th className="px-3 py-2.5">ISSATSO</th>
                          <th className="px-3 py-2.5">Committee</th>
                          <th className="px-3 py-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                        {rows.map((r) => {
                          const s = ROW_STATUS[r.status];
                          return (
                            <tr key={r.rowNumber}>
                              <td className="px-3 py-2 text-neutral-400">
                                {r.rowNumber}
                              </td>
                              <td className="px-3 py-2 font-medium text-foreground">
                                {r.fullName || "—"}
                              </td>
                              <td className="px-3 py-2 text-neutral-500 dark:text-neutral-400">
                                {r.email || "—"}
                              </td>
                              <td className="px-3 py-2 text-neutral-500 dark:text-neutral-400">
                                {r.issatsoAnswer || "—"}
                              </td>
                              <td className="px-3 py-2 text-neutral-500 dark:text-neutral-400">
                                {r.committeeLabel || "—"}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.className}`}
                                >
                                  {s.label}
                                </span>
                                {r.reason && (
                                  <span className="ml-2 text-[11px] text-neutral-400">
                                    {r.reason}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Step 3: result */}
              {result && result.ok && (
                <p className="rounded-lg bg-status-accepted/10 px-4 py-3 text-sm text-status-accepted">
                  Imported {result.summary.imported} applicant
                  {result.summary.imported === 1 ? "" : "s"} and auto-rejected{" "}
                  {result.summary.autoRejected}. Skipped{" "}
                  {result.summary.duplicatesSkipped} duplicate
                  {result.summary.duplicatesSkipped === 1 ? "" : "s"} and{" "}
                  {result.summary.errors} error
                  {result.summary.errors === 1 ? "" : "s"}.
                </p>
              )}
              {result && !result.ok && (
                <p className="rounded-lg bg-status-rejected/10 px-4 py-3 text-sm text-status-rejected">
                  {result.error}
                </p>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-3 border-t border-neutral-200 p-5 dark:border-neutral-800">
              {result?.ok ? (
                <Button onClick={close}>Done</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={close} disabled={pending}>
                    Cancel
                  </Button>
                  <Button
                    onClick={commit}
                    disabled={pending || !summary || committable === 0}
                  >
                    {pending
                      ? "Importing…"
                      : `Confirm Import (${committable})`}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "accepted" | "rejected" | "pending" | "neutral";
  children: React.ReactNode;
}) {
  const className =
    tone === "accepted"
      ? "bg-status-accepted/10 text-status-accepted"
      : tone === "rejected"
        ? "bg-status-rejected/10 text-status-rejected"
        : tone === "pending"
          ? "bg-status-pending/15 text-[color:var(--status-pending)]"
          : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300";
  return (
    <span className={`rounded-full px-2.5 py-1 ${className}`}>{children}</span>
  );
}

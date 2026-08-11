"use client";

import { useEffect } from "react";

import { Icon } from "@/components/app-shell/icon";
import { ApplicantAnswerPanel } from "@/components/applicant-answer-panel";
import type { AnswerPanelQuestion } from "@/lib/phase1-answers";
import { StatusBadge } from "./status-badge";
import type { ApplicantRow } from "./applicants-view";

/**
 * One applicant's complete submitted answers, over the Applicants table.
 *
 * WHY THIS EXISTS: VIEW_FULL_POOL reads "See every applicant in the campaign
 * and read their complete application answers", but the table only ever showed
 * name / email / committee / ISSATSO / status — half of what the permission
 * promises. This is the other half.
 *
 * The body is <ApplicantAnswerPanel> in "full" mode — the very component the
 * Phase 1 Scoring Queue reads from, so an answer resolves through exactly one
 * rule (answerKey = sourceField ?? text, see lib/phase1-answers.ts) and the two
 * screens cannot disagree about what this applicant wrote. Nothing about answer
 * resolution is re-implemented here.
 *
 * Shell follows <ImportPanel> next door — its own wide scrollable container
 * rather than AlertDialogContent's narrow centred popup, on the same reasoning:
 * this is a reading surface, not a confirmation. Overlay and surface tokens are
 * the baseline ones, so it reads as the same family of modal.
 */
export function AnswersDialog({
  applicant,
  questions,
  onClose,
}: {
  /** The applicant to show. The dialog renders only when this is non-null. */
  applicant: ApplicantRow | null;
  questions: AnswerPanelQuestion[];
  onClose: () => void;
}) {
  const open = applicant !== null;

  // Escape to dismiss, and the page behind stops scrolling while open — the
  // same pair the app shell's navigation drawer installs, and for the same
  // reason: an overlay whose backdrop scrolls reads as a floating panel.
  // Keyed on `open`, so neither is installed while the dialog is closed.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!applicant) return null;

  const rawFormData = (applicant.rawFormData ?? null) as Record<
    string,
    unknown
  > | null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/10 p-2 duration-200 supports-backdrop-filter:backdrop-blur-xs motion-safe:animate-in motion-safe:fade-in-0 sm:p-8"
      // Backdrop dismissal. Guarded on the target being the backdrop itself so
      // a click that lands inside the panel — or a text selection that ends
      // outside it — doesn't close the dialog mid-read.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="answers-dialog-title"
        className="w-full max-w-3xl rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10 duration-200 motion-safe:animate-in motion-safe:zoom-in-95"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 p-4 sm:p-5 dark:border-neutral-800">
          <div className="min-w-0">
            <h2
              id="answers-dialog-title"
              className="truncate text-base font-semibold text-foreground sm:text-lg"
            >
              {applicant.fullName}
            </h2>
            {/* break-all rather than truncate, same as the mobile card: a long
                address is worth reading in full. */}
            <p className="break-all text-sm text-neutral-500 dark:text-neutral-400">
              {applicant.email}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {applicant.preferredCommittee}
              </span>
              <StatusBadge status={applicant.status} />
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {applicant.isIssatsoStudent
                  ? "ISSATSO student"
                  : "Not ISSATSO"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            autoFocus
            className="-mr-1 shrink-0 cursor-pointer text-neutral-400 transition-colors duration-150 ease-out hover:text-foreground motion-reduce:transition-none"
          >
            <Icon name="close" className="text-[22px]" />
          </button>
        </div>

        {/* Caps at the viewport so a long submission scrolls inside the panel
            instead of pushing the close button off-screen. dvh for the same
            reason AlertDialogContent uses it — a phone's browser chrome. */}
        <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto p-4 sm:p-5">
          {rawFormData === null ? (
            <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-8 text-center text-sm italic text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              No submitted form data was stored for this applicant.
            </p>
          ) : (
            <ApplicantAnswerPanel
              // Always "full": this page is gated by VIEW_FULL_POOL, which is
              // the permission that grants complete answers. The restricted
              // "technical-only" variant belongs to ENTER_TECHNICAL_SCORE on
              // the Phase 1 queue, and has no meaning here.
              viewMode="full"
              fullName={applicant.fullName}
              questions={questions}
              rawFormData={rawFormData}
            />
          )}
        </div>
      </div>
    </div>
  );
}

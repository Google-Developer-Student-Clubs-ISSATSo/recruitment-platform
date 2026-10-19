"use client";

import { useState, useTransition } from "react";

import { savePhaseOneNote } from "./actions";

// Must match the cap the server action enforces — the textarea blocks a longer
// paste before it is ever sent.
const NOTE_MAX_LENGTH = 2000;

/**
 * The shared screening note for the selected applicant: one free-text comment
 * the screeners maintain together, saved explicitly (unlike the score buttons'
 * instant writes — notes get reworded and a save-on-every-keystroke would spam
 * both the network and the activity log with false history). Save-enabled only
 * when the text actually differs from what the server last returned, and a
 * "Saved" receipt that stays until the next keystroke mirrors how the button
 * animations acknowledge a score pick.
 *
 * Rendered keyed by applicant id (key={applicantId} at the Phase1ScoringClient
 * call site), which resets only this component's EPHEMERAL per-applicant state:
 * the "Saved" flash, the error line, the pending-save UI. The note text itself
 * lives in Phase1ScoringClient's draft record and is handed in through props,
 * so switching people can never destroy an unsaved draft, and the
 * last-acknowledged baseline travels with it so "Saved" stays true across the
 * round trip.
 */
export function ScoringNote({
  campaignId,
  applicantId,
  initialNote,
  draft,
  savedBaseline,
  onDraftChange,
  onSaved,
}: {
  campaignId: string;
  applicantId: string;
  initialNote: string;
  /** Live text for this applicant, owned by Phase1ScoringClient as
   *  Record<applicantId, string>; undefined means "no local edits yet". */
  draft?: string;
  /** The text last acknowledged by the server for this applicant, also owned
   *  by Phase1ScoringClient so it survives the keyed remount — the server props'
   *  `note` is only a mount/refresh-time snapshot and never advances on save. */
  savedBaseline?: string;
  onDraftChange: (value: string) => void;
  /** Fired with the acknowledged text after a successful save: the parent
   *  advances its baseline and clears the (matching) unsaved draft entry. */
  onSaved: (savedText: string) => void;
}) {
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  // Text is controlled from the parent: an unsaved edit, else the last
  // acknowledged save, else the server snapshot. `dirty` is measured against
  // the acknowledged baseline, never against `initialNote` alone — that prop
  // never advances on save, so comparing to it made a successful save report
  // "Unsaved changes" forever.
  const text = draft ?? savedBaseline ?? initialNote;
  const dirty = text !== (savedBaseline ?? initialNote);

  function save() {
    setError(null);
    startSave(async () => {
      const res = await savePhaseOneNote(campaignId, applicantId, text);
      if (res.ok) {
        // Hand the acknowledged text up before the "Saved" receipt, so the
        // parent advances its baseline in the same commit and dirty goes
        // false with the flash, not one render later.
        onSaved(text);
        setSavedFlash(true);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <label
        htmlFor={`phase1-note-${applicantId}`}
        className="text-xs font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400"
      >
        Note
      </label>
      <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
        Anything to flag for the ranking stage or the decision meeting. Shared
        by everyone screening this applicant.
      </p>
      <textarea
        id={`phase1-note-${applicantId}`}
        value={text}
        maxLength={NOTE_MAX_LENGTH}
        onChange={(e) => {
          onDraftChange(e.target.value);
          setSavedFlash(false);
        }}
        rows={3}
        placeholder="e.g. To discuss — claimed higher skill than the CV shows…"
        className="mt-2 w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 ease-out placeholder:text-neutral-400 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none dark:border-neutral-800 dark:bg-neutral-900 dark:placeholder:text-neutral-500"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p
          aria-live="polite"
          className={`text-[11px] ${
            error
              ? "text-status-rejected"
              : dirty
                ? "text-neutral-400 dark:text-neutral-500"
                : savedFlash
                  ? "text-status-accepted"
                  : "text-transparent"
          }`}
        >
          {error ?? (dirty ? "Unsaved changes" : savedFlash ? "Saved" : "")}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity duration-150 ease-out hover:opacity-90 disabled:cursor-default disabled:opacity-50 motion-reduce:transition-none"
        >
          {saving ? "Saving…" : "Save note"}
        </button>
      </div>
    </div>
  );
}

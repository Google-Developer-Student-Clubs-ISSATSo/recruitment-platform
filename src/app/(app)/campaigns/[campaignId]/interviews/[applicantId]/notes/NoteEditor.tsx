"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";

import { Icon, type IconName } from "@/components/app-shell/icon";
import {
  NOTE_FIELDS,
  computeAverage,
  formatAverage,
  type NoteFieldKey,
  type NoteScores,
} from "@/lib/interview-note";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";
import { RatingControl, fmtRating } from "./RatingControl";
import { saveNoteRatingAction, saveNoteRemarksAction } from "./actions";

/** How long the remarks box stays quiet before it saves. */
const REMARKS_DEBOUNCE_MS = 800;

/**
 * Which of the three states the note is in, spelled out rather than inferred
 * from `editable` alone: "can't edit" has two very different causes here, and a
 * jury member who closed the note by mistake needs to see WHICH one applies.
 */
export type NoteMode = "edit" | "readonly" | "locked";

const MODE_STYLE: Record<
  NoteMode,
  {
    icon: IconName;
    label: string;
    detail: string;
    /** Chip colours. */
    chip: string;
    /** Surface treatment applied to every panel below. */
    surface: string;
  }
> = {
  edit: {
    icon: "edit_note",
    label: "Editing",
    detail: "Changes save automatically as you go.",
    chip: "bg-status-accepted/10 text-status-accepted",
    surface:
      "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
  },
  readonly: {
    icon: "visibility",
    label: "Read-only",
    detail: "You're not on this applicant's panel.",
    chip: "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-200",
    surface:
      "border-dashed border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900/50",
  },
  // A closed note only ever renders for MANAGE_ACCOUNTS, who CAN still write to
  // it — canEditInterviewNote lets them through before the closed check. So the
  // inputs stay live and the surface shouts instead: dashed and red-tinted, so
  // an admin editing a locked note can never mistake it for a normal one.
  locked: {
    icon: "lock",
    label: "Closed",
    detail: "This note is closed — only account managers can still change it.",
    chip: "bg-status-rejected/10 text-status-rejected",
    surface:
      "border-dashed border-status-rejected/40 bg-status-rejected/[0.03] dark:bg-status-rejected/[0.06]",
  },
};

/**
 * The interview note itself — seven ratings, a live average, and remarks.
 *
 * Layout follows the Stitch "Interview Notes" screen (score-summary panel beside
 * a two-column metrics grid, remarks underneath) using our own tokens. One
 * deliberate departure: Stitch has Save Draft / Discard / Submit buttons, but
 * this note is shared and saves per field on change, so a submit step would
 * imply the note isn't live until pressed. The save state is surfaced inline
 * instead.
 *
 * The mode (editing / read-only / locked) is carried by the surface itself, not
 * only by a banner at the top: a solid white card means you can type into it, a
 * dashed muted one means you cannot. That distinction has to survive scrolling
 * past the header, which a banner does not.
 */
export function NoteEditor({
  campaignId,
  applicantId,
  editable,
  mode,
  initialScores,
  initialRemarks,
}: {
  campaignId: string;
  applicantId: string;
  editable: boolean;
  mode: NoteMode;
  initialScores: NoteScores;
  initialRemarks: string;
}) {
  const [scores, setScores] = useState<NoteScores>(initialScores);
  const [remarks, setRemarks] = useState(initialRemarks);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const reduced = useReducedMotion();

  const style = MODE_STYLE[mode];

  // AVG is recomputed from local state on every draft move, so it tracks the
  // slider live rather than waiting for the round-trip.
  const average = computeAverage(scores);
  const ratedCount = NOTE_FIELDS.filter(
    (f) => typeof scores[f.key] === "number",
  ).length;
  const completeness = (ratedCount / NOTE_FIELDS.length) * 100;

  function commitRating(field: NoteFieldKey, value: number) {
    setError(null);
    startTransition(async () => {
      const res = await saveNoteRatingAction(
        campaignId,
        applicantId,
        field,
        value,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedAt(Date.now());
    });
  }

  // Remarks debounce: a textarea fires per keystroke, and one activity-log entry
  // per character would be unreadable. Save once typing pauses.
  const remarksTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (remarksTimer.current) clearTimeout(remarksTimer.current);
  }, []);

  function onRemarksChange(next: string) {
    setRemarks(next);
    if (!editable) return;
    if (remarksTimer.current) clearTimeout(remarksTimer.current);
    remarksTimer.current = setTimeout(() => {
      setError(null);
      startTransition(async () => {
        const res = await saveNoteRemarksAction(campaignId, applicantId, next);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSavedAt(Date.now());
      });
    }, REMARKS_DEBOUNCE_MS);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* Score summary. Sticks alongside the fields from lg up — the running
          average is the thing you check while rating the seventh dimension, and
          it scrolls out of view otherwise. */}
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div
          className={`rounded-xl border p-6 text-center transition-colors duration-200 ease-out motion-reduce:transition-none ${style.surface}`}
        >
          {/* Mode chip — the at-a-glance answer to "can I type in this?".
              Crossfaded on change: reopening a note flips this tree from locked
              to editable in place (router.refresh, no remount), and that is the
              one moment the page has to tell you your access just changed. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={mode}
              initial={reduced ? false : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: DURATION.fast, ease: EASE.out }
              }
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${style.chip}`}
            >
              <Icon name={style.icon} className="text-[13px]" />
              {style.label}
            </motion.span>
          </AnimatePresence>

          <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
            Average Score
          </p>
          <p
            className={`mt-2 text-5xl font-bold tabular-nums ${
              average === null
                ? "text-neutral-300 dark:text-neutral-600"
                : "text-primary"
            }`}
          >
            {formatAverage(average)}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Scale 0.0 – 10.0
          </p>

          <div className="mt-4 text-left">
            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
              <span>Completeness</span>
              <span className="tabular-nums">
                {ratedCount}/{NOTE_FIELDS.length}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={false}
                animate={{ width: `${completeness}%` }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { duration: DURATION.base, ease: EASE.out }
                }
              />
            </div>
            {average !== null && ratedCount < NOTE_FIELDS.length && (
              <p className="mt-2 text-[11px] text-neutral-400">
                Averaged over the {ratedCount} field
                {ratedCount === 1 ? "" : "s"} rated so far.
              </p>
            )}
          </div>
        </div>

        {editable ? (
          <div className="flex items-center justify-center gap-1.5 text-xs">
            {error ? (
              <span className="text-status-rejected">{error}</span>
            ) : pending ? (
              <span className="text-neutral-500 dark:text-neutral-400">
                Saving…
              </span>
            ) : savedAt !== null ? (
              <span className="flex items-center gap-1 text-status-accepted">
                <Icon name="check" className="text-[14px]" />
                Saved
              </span>
            ) : (
              <span className="text-neutral-400">
                Changes save automatically.
              </span>
            )}
          </div>
        ) : (
          // The locked/read-only counterpart of the save-state line, so the
          // column ends the same way in every mode rather than losing a row.
          <p className="flex items-start justify-center gap-1.5 text-center text-xs text-neutral-500 dark:text-neutral-400">
            <Icon name={style.icon} className="mt-px text-[14px]" />
            {style.detail}
          </p>
        )}
      </aside>

      {/* Ratings + remarks */}
      <div className="space-y-6">
        <section
          className={`rounded-xl border p-4 transition-colors duration-200 ease-out motion-reduce:transition-none sm:p-6 ${style.surface}`}
        >
          <h2 className="text-lg font-semibold text-foreground">
            Performance Metrics
          </h2>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            Rate each dimension from 0 to 10, in steps of 0.25.
          </p>

          <div className="mt-5 grid gap-x-8 gap-y-6 md:grid-cols-2">
            {NOTE_FIELDS.map((field) => {
              const value = scores[field.key] ?? null;
              return (
                <div key={field.key}>
                  <label
                    htmlFor={`rating-${field.key}`}
                    className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400"
                  >
                    {field.label}
                  </label>
                  <div className="mt-2">
                    <RatingControl
                      id={`rating-${field.key}`}
                      label={field.label}
                      value={value}
                      editable={editable}
                      pending={pending}
                      onDraft={(v) =>
                        setScores((s) => ({ ...s, [field.key]: v }))
                      }
                      onCommit={(v) => commitRating(field.key, v)}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-neutral-400">{field.hint}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section
          className={`rounded-xl border p-4 transition-colors duration-200 ease-out motion-reduce:transition-none sm:p-6 ${style.surface}`}
        >
          <h2 className="text-sm font-semibold text-foreground">
            Detailed remarks &amp; recommendations
          </h2>
          {editable ? (
            <textarea
              value={remarks}
              onChange={(e) => onRemarksChange(e.target.value)}
              rows={6}
              placeholder="Summarise the candidate's performance, key strengths, and areas for improvement…"
              aria-label="Detailed remarks and recommendations"
              className="mt-3 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-foreground dark:border-neutral-700 dark:bg-neutral-900"
            />
          ) : remarks.trim() === "" ? (
            <p className="mt-3 text-sm italic text-neutral-400">
              No remarks recorded.
            </p>
          ) : (
            <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">
              {remarks}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

export { fmtRating };

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon, type IconName } from "@/components/app-shell/icon";
import {
  NOTE_FIELDS,
  computeAverage,
  formatAverage,
  type NoteScores,
} from "@/lib/interview-note";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";
import { RatingControl, fmtRating } from "./RatingControl";
import { closeInterviewNoteAction } from "./actions";

/**
 * Local draft autosave — the crash net for the "closing is the save" workflow.
 *
 * Because nothing is written server-side until a COMPLETE note is closed, an
 * interrupted session (tab closed, browser crash, PC replaced mid-review) used
 * to lose everything. So every change is also written to THIS browser's
 * localStorage, debounced, under a key scoped to campaign + applicant + viewer,
 * and restored on the next visit. Deliberately client-only: no periodic POSTs,
 * no schema field — at the cost of being per-browser. Cross-device carry-over
 * is not a goal; the note itself is already saved anywhere closing succeeded.
 *
 * A draft is only honored if it is NEWER than the server's copy of the note —
 * a draft older than a close (or any server write) is stale and silently
 * dropped, so an old draft can never resurrect itself over fresh data.
 */

/** How long edits settle before they're written to localStorage. */
const DRAFT_DEBOUNCE_MS = 500;

const DRAFT_KEY_PREFIX = "gdgc-interview-draft:";

type StoredDraft = { scores: NoteScores; remarks: string; at: string };

function draftKeyOf(
  campaignId: string,
  applicantId: string,
  viewerId: string,
): string {
  return `${DRAFT_KEY_PREFIX}${campaignId}:${applicantId}:${viewerId}`;
}

/**
 * Read the viewer's stored draft, or null if there is none worth restoring.
 * Corrupt or shape-invalid entries are removed; entries older than the server
 * copy are too (stale, never resurrected).
 */
function readStoredDraft(
  key: string,
  serverUpdatedAtMs: number | null,
): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<StoredDraft> | null;
    if (!d || typeof d.remarks !== "string" || typeof d.at !== "string") {
      window.localStorage.removeItem(key);
      return null;
    }
    const candidate = d.scores as Partial<NoteScores> | null;
    // Every field must be a number or null — anything else (a pickled older
    // shape, hand-tampered data) is discarded rather than trusted.
    const wellShaped =
      !!candidate &&
      NOTE_FIELDS.every((f) => {
        const v = candidate[f.key];
        return typeof v === "number" || v === null;
      });
    if (!wellShaped) {
      window.localStorage.removeItem(key);
      return null;
    }
    // Server newer than the draft means the note moved on without this
    // browser — closed, or otherwise written elsewhere. Drop and move on.
    if (serverUpdatedAtMs !== null && Date.parse(d.at) <= serverUpdatedAtMs) {
      window.localStorage.removeItem(key);
      return null;
    }
    return { scores: candidate as NoteScores, remarks: d.remarks, at: d.at };
  } catch {
    // Unparseable JSON can't be trusted — clear it and start fresh.
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage read worked but the clear didn't; irrelevant either way.
    }
    return null;
  }
}

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
    label: "Drafting",
    detail: "Entries are stored when you close the interview.",
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
  // A closed note is edit-locked for EVERYONE — reopening it (an admin-only
  // act) is the one way back into a closed note — but MANAGE_ACCOUNTS is still
  // the only identity that can even SEE this page once closed. So locked mode
  // is admin-viewing: every input is dead and the surface shouts, dashed and
  // red-tinted, so it can never be mistaken for a normal editable one.
  locked: {
    icon: "lock",
    label: "Closed",
    detail: "This note is closed — reopen it to make changes.",
    chip: "bg-status-rejected/10 text-status-rejected",
    surface:
      "border-dashed border-status-rejected/40 bg-status-rejected/[0.03] dark:bg-status-rejected/[0.06]",
  },
};

/**
 * The interview note itself — seven ratings, a live average, and remarks.
 *
 * Layout follows the Stitch "Interview Notes" screen (score-summary panel beside
 * a two-column metrics grid, remarks underneath) using our own tokens.
 *
 * There is deliberately NO Save button. Every change stays LOCAL, and exactly
 * one act stores the note: closing the interview. The Close control renders a
 * strip at the bottom of the page (see the layout comment there) and refuses to
 * proceed until ALL seven ratings are set — then ONE request writes the whole
 * note (ratings + remarks) AND closes it.
 *
 * Interruption safety comes from the LOCAL draft (see the block comment at
 * draftKeyOf): every change also lands in this browser's localStorage, watched
 * by a staleness check, and is restored on the next visit — a closed tab, a
 * browser crash, even a reboot. Two backstops, no backend traffic either way.
 *
 * The mode (drafting / read-only / locked) is carried by the surface itself, not
 * only by a banner at the top: a solid white card means you can type into it, a
 * dashed muted one means you cannot. That distinction has to survive scrolling
 * past the header, which a banner does not.
 */
export function NoteEditor({
  campaignId,
  applicantId,
  editable,
  mode,
  viewerId,
  noteUpdatedAt = null,
  initialScores,
  initialRemarks,
  canClose = false,
  tooEarly = false,
  canForceClose = false,
  scheduledLabel = null,
  allowedAtLabel = null,
}: {
  campaignId: string;
  applicantId: string;
  editable: boolean;
  mode: NoteMode;
  /** Who is looking — scopes the LOCAL draft so drafts can't cross viewers. */
  viewerId: string;
  /** The server note's last write, as Date — decides if a stored draft is stale. */
  noteUpdatedAt?: Date | null;
  initialScores: NoteScores;
  initialRemarks: string;
  /** May the viewer close this (open) note? Drives the bottom close strip. */
  canClose?: boolean;
  /** The interview's scheduled time (+ grace) hasn't passed yet. */
  tooEarly?: boolean;
  /** MANAGE_ACCOUNTS — may override {@link tooEarly}, after confirming. */
  canForceClose?: boolean;
  /** Tunis-formatted scheduled time, for the messages. Null when unscheduled. */
  scheduledLabel?: string | null;
  /** Tunis-formatted moment closing becomes normally available. */
  allowedAtLabel?: string | null;
}) {
  const [scores, setScores] = useState<NoteScores>(initialScores);
  const [remarks, setRemarks] = useState(initialRemarks);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Why Close was refused the last press — "not all seven rated yet". Cleared
  // by the press that gets past the check.
  const [closeWarning, setCloseWarning] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const router = useRouter();

  const style = MODE_STYLE[mode];

  // AVG is recomputed from local state on every draft move, so it tracks the
  // slider live rather than waiting for the round-trip.
  const average = computeAverage(scores);
  const ratedCount = NOTE_FIELDS.filter(
    (f) => typeof scores[f.key] === "number",
  ).length;
  const completeness = (ratedCount / NOTE_FIELDS.length) * 100;

  // An early close is offered ONLY to an Administrator, and only as an
  // explicitly-confirmed override. Everyone else gets a disabled button and is
  // told when it opens up — the action refuses them regardless of what the
  // client sends, so this is signposting, not the enforcement.
  const blocked = tooEarly && !canForceClose;
  const forcing = tooEarly && canForceClose;

  // Unsaved edits = the draft differs from the server render. The browser guard
  // is the backstop for reload/tab-close; the localStorage draft (below) is the
  // one that actually lets the work SURVIVE an interruption. In-app navigation
  // carries the same risk, which is exactly the workflow choice at the bottom
  // of the page: closing is what saves.
  const dirty =
    remarks !== initialRemarks ||
    NOTE_FIELDS.some((f) => scores[f.key] !== initialScores[f.key]);
  useBeforeUnloadGuard(dirty && editable);

  // ----- LOCAL DRAFT (crash net) -------------------------------------------
  const key = draftKeyOf(campaignId, applicantId, viewerId);
  const serverUpdatedAtMs = noteUpdatedAt?.getTime() ?? null;
  // "This session resumed an earlier draft" — drives the sidebar notice.
  const [restored, setRestored] = useState(false);

  // Restore AFTER hydration: localStorage doesn't exist during SSR, and reading
  // it in a state initializer would render different client HTML than the
  // server sent. The restore itself is deferred a tick (setState may not run
  // synchronously in an effect body) — still so early the user never sees the
  // unserved values. Also runs on reopen (mode flips to editable in place, no
  // remount), where readStoredDraft drops any now-stale draft on its own.
  useEffect(() => {
    if (!editable) return;
    const r = setTimeout(() => {
      const draft = readStoredDraft(key, serverUpdatedAtMs);
      if (draft) {
        setScores(draft.scores);
        setRemarks(draft.remarks);
        setRestored(true);
      }
    }, 0);
    return () => clearTimeout(r);
  }, [editable, key, serverUpdatedAtMs]);

  // Write every change through, debounced: slider drags fire per pixel, but a
  // settled keystroke/drag lands within half a second — at most 500ms of work
  // is ever at risk after that. Silent on storage being full/disabled: the
  // draft is a safety net, losing it degrades to the pre-feature behavior.
  useEffect(() => {
    if (!editable || !dirty) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            scores,
            remarks,
            at: new Date().toISOString(),
          } satisfies StoredDraft),
        );
      } catch {
        // Storage refused (private mode, quota) — draft persistence is best-effort.
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [scores, remarks, dirty, editable, key]);

  function dropDraft() {
    try {
      localStorage.removeItem(key);
      setRestored(false);
    } catch {
      // Nothing worse to do — worst case the stale draft is dropped next
      // visit by the staleness check.
    }
  }

  function attemptClose() {
    // Completeness first: all seven ratings must be set. The server re-checks
    // this on the close request, so this is guidance, not the gate.
    if (ratedCount < NOTE_FIELDS.length) {
      setCloseWarning(
        `Every rating is required before closing — ${ratedCount} of ${NOTE_FIELDS.length} set.`,
      );
      return;
    }
    setCloseWarning(null);
    setDialogOpen(true);
  }

  function doClose() {
    setError(null);
    startTransition(async () => {
      // `forcing` is passed through as the caller's explicit intent. The server
      // refuses an early close without it, even for an Administrator.
      const res = await closeInterviewNoteAction(
        campaignId,
        applicantId,
        scores,
        remarks,
        forcing,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Everything just landed on the server — the local draft's purpose is
      // over. (If the close FAILED, the draft is deliberately kept: the work
      // still exists only here.)
      dropDraft();
      // The closer loses access to this page — send them back to the board.
      router.push(`/campaigns/${campaignId}/interviews`);
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Score summary. Sticks alongside the fields from lg up — the running
            average is the thing you check while rating the seventh dimension,
            and it scrolls out of view otherwise. */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div
            className={`rounded-xl border p-6 text-center transition-colors duration-200 ease-out motion-reduce:transition-none ${style.surface}`}
          >
            {/* Mode chip — the at-a-glance answer to "can I type in this?".
                Crossfaded on change: reopening a note flips this tree from
                locked to editable in place (router.refresh, no remount), and
                that is the one moment the page has to tell you your access just
                changed. */}
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
              {/* The 7/7 requirement isn't cosmetic: closing demands it, so
                  spell that out right here rather than only at the button. */}
              <p className="mt-2 text-[11px] text-neutral-400">
                {ratedCount === NOTE_FIELDS.length
                  ? "All rated — the note can be closed."
                  : "All seven are required to close the note."}
              </p>
            </div>
          </div>

          {editable ? (
            // The save-state line mirrors the strip at the bottom of the page,
            // in the sticky column, while you work through the seven fields.
            <div className="flex items-center justify-center gap-1.5 text-xs">
              {error ? (
                <span className="text-status-rejected">{error}</span>
              ) : pending ? (
                <span className="text-neutral-500 dark:text-neutral-400">
                  Closing…
                </span>
              ) : (
                <span className="text-neutral-400">
                  {restored
                    ? "Draft restored — pick up where you left off."
                    : "Entries are stored when you close the interview."}
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
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-neutral-400">
                      {field.hint}
                    </p>
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
                onChange={(e) => setRemarks(e.target.value)}
                rows={6}
                disabled={pending}
                placeholder="Summarise the candidate's performance, key strengths, and areas for improvement…"
                aria-label="Detailed remarks and recommendations"
                className="mt-3 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-foreground disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
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

      {/* Close Interview — deliberately the LAST thing on the page.
          This strip ends the workflow: rate everything (7/7), then close, and
          the close is what saves. It gets its own bordered strip rather than a
          small button in the header, because a control this consequential —
          irreversible access for the whole panel — must not be missed. The
          server re-checks completeness and all eligibility here. */}
      {canClose && (
        <section className="flex flex-col gap-4 rounded-xl border border-status-rejected/40 bg-status-rejected/[0.04] p-4 dark:border-status-rejected/50 dark:bg-status-rejected/[0.08] sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex min-w-0 items-start gap-3">
            <Icon
              name="lock"
              className="mt-0.5 shrink-0 text-[20px] text-status-rejected"
            />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">
                Interview finished?
              </h2>
              <p className="mt-1 max-w-2xl text-xs text-neutral-500 dark:text-neutral-400">
                Closing stores everything entered here — all seven ratings and
                the remarks — then locks the note for{" "}
                <strong className="font-semibold text-foreground">
                  everyone
                </strong>
                . You&apos;ll lose access to it too; only an account manager can
                reopen it.
                {tooEarly &&
                  (scheduledLabel
                    ? ` It's scheduled for ${scheduledLabel}.`
                    : " The interview hasn't happened yet.")}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
            {/* The one big, solid, red control on the page: it sits in its own
                bottom strip and is the last thing a panelist does here, so it
                should look like it — unmissable, and unmistakably fatal. */}
            <Button
              size="lg"
              disabled={pending || blocked}
              onClick={attemptClose}
              className="bg-status-rejected text-white hover:bg-status-rejected/90 dark:bg-status-rejected dark:text-neutral-950 dark:hover:bg-status-rejected/85"
            >
              <Icon name="lock" className="text-[16px]" />
              {forcing ? "Force Close Interview" : "Close Interview"}
            </Button>

            {/* Why Close won't proceed, in text rather than only a title
                attribute — a refused button with no visible reason reads as a
                bug. Incomplete sits above the too-early text; both can show. */}
            {closeWarning && (
              <span className="flex items-center gap-1 text-right text-xs text-status-rejected">
                <Icon name="warning" className="text-[14px]" />
                {closeWarning}
              </span>
            )}
            {blocked && allowedAtLabel && (
              <span className="max-w-xs text-xs text-neutral-500 sm:justify-self-end dark:text-neutral-400">
                {scheduledLabel
                  ? `Scheduled for ${scheduledLabel}. You can close this note from ${allowedAtLabel}.`
                  : `You can close this note from ${allowedAtLabel}.`}
              </span>
            )}

            {error && <span className="text-xs text-status-rejected">{error}</span>}
          </div>

          <ConfirmDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            title={
              forcing
                ? "Force close before the interview?"
                : "Close this interview note?"
            }
            description={
              forcing ? (
                <>
                  This interview is scheduled for{" "}
                  <strong>{scheduledLabel ?? "a later time"}</strong>, which
                  hasn&apos;t passed yet — force close anyway?
                  <br />
                  <br />
                  Closing stores all entered ratings and remarks, then locks the
                  note. This override is recorded in the activity log as a force
                  close, separately from an ordinary one.
                </>
              ) : (
                <>
                  Closing stores everything you&apos;ve entered — all seven
                  ratings and the remarks — then locks the note for{" "}
                  <strong>everyone</strong>. You&apos;ll{" "}
                  <strong>no longer be able to view or edit it</strong> — only
                  an account manager can reopen it or see it again.
                </>
              )
            }
            confirmLabel={forcing ? "Force close anyway" : "Close interview"}
            destructive
            onConfirm={doClose}
          />
        </section>
      )}
    </div>
  );
}

/**
 * Ask before a reload/tab-close discards the local-only draft. Inert until
 * something has actually been changed.
 */
function useBeforeUnloadGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      // Both lines together cover the newer and legacy browser APIs.
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}

export { fmtRating };

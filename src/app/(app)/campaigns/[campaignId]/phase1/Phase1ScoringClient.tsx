"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { motion } from "motion/react";

import { Icon } from "@/components/app-shell/icon";
import { RefreshButton } from "@/components/refresh-button";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";
import { computeWeightedTotal, totalCoefficient } from "@/lib/phase1-score";
import { savePhaseOneScore } from "./actions";
import { ApplicantQueueList, type QueueEntry } from "./ApplicantQueueList";
import { ApplicantProfile } from "./ApplicantProfile";
import { QuestionRow, QuestionRows } from "./QuestionRow";
import { otherAnswers, profileFields, rowAnswer } from "./row-data";
import { ScoringNote } from "./ScoringNote";
import { WeightedTotalDisplay } from "./WeightedTotalDisplay";
import { ProcessedRemainingCounter } from "./ProcessedRemainingCounter";
import {
  canEditQuestion,
  type Phase1Applicant,
  type Phase1Question,
  type UserCaps,
  type ViewMode,
} from "./types";

type FailedScoreAlert = {
  applicantId: string;
  questionId: string;
  /** The value the failed write attempted, so Retry can re-send it verbatim. */
  value: number;
  message: string;
};

export function Phase1ScoringClient({
  campaignId,
  viewMode,
  questions,
  totalQuestions,
  initialApplicants,
  caps,
}: {
  campaignId: string;
  viewMode: ViewMode;
  questions: Phase1Question[];
  totalQuestions: number;
  initialApplicants: Phase1Applicant[];
  caps: UserCaps;
}) {
  const [applicants, setApplicants] = useState(initialApplicants);
  const [, startTransition] = useTransition();
  // Saves currently in flight, keyed "applicantId:questionId". Per-row so a
  // slow write freezes ONLY its own scale: every other question stays fully
  // interactive while the save lands, instead of the old global `pending`
  // blanket-disabling every score button on the page.
  const [savingScores, setSavingScores] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // The last FAILED score write, anchored to the row it belongs to. Rendered
  // beside the Scoring panel header (role="alert") with a one-click Retry,
  // instead of the old top-of-page banner that a scrolled rail or answer pane
  // could take out of view and that was silent to assistive tech. Only the
  // most recent failure shows — a newer failure replaces it; a success or any
  // pick for the failed question clears it.
  const [failedScore, setFailedScore] = useState<FailedScoreAlert | null>(
    null,
  );
  const reduced = useReducedMotion();

  // Adopt a NEW server payload when one arrives — what makes the Refresh button
  // above actually show an applicant someone else just scored, or one the Form
  // webhook added to the queue. A soft refresh (router.refresh) streams fresh
  // props in rather than remounting, so the useState initialiser never re-runs
  // on its own and this list would otherwise stay frozen at its mount value.
  //
  // A reference check is correct here, unlike in <EntrySection>: this prop is
  // handed straight down from the server component, so its identity changes
  // only when the server actually re-rendered — never on a local setState.
  const [syncedFrom, setSyncedFrom] = useState(initialApplicants);
  if (initialApplicants !== syncedFrom) {
    setSyncedFrom(initialApplicants);
    setApplicants(initialApplicants);
  }

  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");

  const coefficientTotal = useMemo(
    () => totalCoefficient(questions),
    [questions],
  );

  // Default to the first incomplete applicant (fall back to the first).
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const firstIncomplete = initialApplicants.find(
      (a) => a.scoredCount < totalQuestions,
    );
    return firstIncomplete?.id ?? initialApplicants[0]?.id ?? null;
  });

  // Unsaved note drafts, keyed by applicant, owned HERE rather than inside
  // <ScoringNote>: switching applicants remounts that component (keyed on
  // selected.id), and a keyed textarea would destroy an in-progress note on
  // every switch. An entry means "this applicant has divergent unsaved text";
  // <ScoringNote>'s onSaved clears it once the server acknowledges.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  // The text last acknowledged by the server, per applicant. The server props'
  // `note` is only a mount/refresh-time snapshot and never advances on a save,
  // so without this the note's "Saved" state could not survive the keyed
  // remount — this is ScoringNote's former savedBaseline, hoisted to the owner
  // of the draft.
  const [noteBaselines, setNoteBaselines] = useState<Record<string, string>>({});

  // After switching applicants, move focus to the applicant heading: the
  // keyed crossfade remount otherwise drops focus to <body>, orphaning
  // keyboard users mid-queue. Focusing also scrolls the heading into view, so
  // the next applicant opens at the top rather than mid-list.
  // lastViewedApplicant stays null until the first switch, so the initial
  // page load never steals focus.
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const lastViewedApplicant = useRef<string | null>(null);
  useEffect(() => {
    if (
      selectedId &&
      lastViewedApplicant.current !== null &&
      lastViewedApplicant.current !== selectedId
    ) {
      detailHeadingRef.current?.focus();
    }
    lastViewedApplicant.current = selectedId;
  }, [selectedId]);

  const entries: QueueEntry[] = applicants.map((a) => ({
    id: a.id,
    fullName: a.fullName,
    complete: a.scoredCount === totalQuestions,
    scoredCount: a.scoredCount,
    totalQuestions,
  }));

  const processed = entries.filter((e) => e.complete).length;
  const selected = applicants.find((a) => a.id === selectedId) ?? null;

  // Who the failed-save alert describes, for the "saving someone else's row"
  // case: the alert sits in the currently selected applicant's panel, but the
  // failed write may belong to an applicant the reviewer already moved away
  // from, so the name is prefixed to keep the alert self-explanatory.
  const failedName = failedScore
    ? applicants.find((a) => a.id === failedScore.applicantId)?.fullName
    : null;

  // Weighted total is only shown to full reviewers — the technical-only viewer
  // never receives the other questions' scores to compute it from.
  const selectedTotal =
    selected && viewMode === "full"
      ? computeWeightedTotal(questions, (id) => selected.scores[id]).total
      : 0;
  const selectedComplete = selected
    ? selected.scoredCount === totalQuestions
    : false;

  // The submission split into the workstation's regions: skills above the
  // rows, question rows (answers are looked up per row), then the GitHub /
  // LinkedIn links and the read-only rest after them in the Answers column.
  // "Other" answers are a full-mode concept only — the technical-only payload
  // is pre-stripped to the profile fields, and this view never lists extras.
  const profile = selected
    ? profileFields(questions, selected.rawFormData)
    : [];
  const skills = profile.filter((f) => f.kind === "text");
  const links = profile.filter((f) => f.kind === "link");
  const extras =
    selected && viewMode === "full"
      ? otherAnswers(questions, selected.rawFormData, profile)
      : [];

  // A pick always targets the currently selected applicant.
  function score(question: Phase1Question, value: number) {
    if (!selected) return;
    saveScoreFor(selected.id, question, value);
  }

  // The single write path for a score pick, parameterised by applicant so
  // Retry can re-send a failed save for the applicant it failed FOR, even
  // after the reviewer has moved on to someone else. Bit-for-bit, the
  // optimistic update and the id-keyed revert below are exactly what they
  // were before the refactor.
  function saveScoreFor(
    applicantId: string,
    question: Phase1Question,
    value: number,
  ) {
    const target = applicants.find((a) => a.id === applicantId);
    if (!target) return;
    const prev = target.scores[question.id];
    const wasScored = prev !== undefined;
    const saveKey = `${applicantId}:${question.id}`;

    // Optimistic update — also bump scoredCount if this question is newly scored.
    setApplicants((list) =>
      list.map((a) =>
        a.id === applicantId
          ? {
              ...a,
              scores: { ...a.scores, [question.id]: value },
              scoredCount: wasScored ? a.scoredCount : a.scoredCount + 1,
            }
          : a,
      ),
    );

    // A pick for the failed question — a change of mind, or the Retry click
    // itself — supersedes that row's alert. Alerts on other rows stay put.
    setFailedScore((f) =>
      f && f.applicantId === applicantId && f.questionId === question.id
        ? null
        : f,
    );

    // Mark this row as saving BEFORE the transition starts, so its dot appears
    // and its buttons go inert immediately, while every other row keeps
    // accepting picks. Cleared on both the failure and success paths below.
    setSavingScores((prevSaving) => new Set(prevSaving).add(saveKey));

    startTransition(async () => {
      const res = await savePhaseOneScore(
        campaignId,
        applicantId,
        question.id,
        value,
      );
      if (!res.ok) {
        // Revert value + scoredCount to their pre-optimistic state.
        setApplicants((list) =>
          list.map((a) => {
            if (a.id !== applicantId) return a;
            const scores = { ...a.scores };
            if (wasScored) scores[question.id] = prev;
            else delete scores[question.id];
            return {
              ...a,
              scores,
              scoredCount: wasScored ? a.scoredCount : a.scoredCount - 1,
            };
          }),
        );
        // Surface the failure where it belongs — beside the Scoring panel
        // header, announced by role="alert", carrying the exact write to
        // re-send.
        setFailedScore({
          applicantId,
          questionId: question.id,
          value,
          message: res.error,
        });
      } else {
        // Success — a retried save, or a fresh pick that finally landed —
        // clears the alert for this row.
        setFailedScore((f) =>
          f && f.applicantId === applicantId && f.questionId === question.id
            ? null
            : f,
        );
      }
      // The write has landed (or failed and been reverted): free the row.
      setSavingScores((prevSaving) => {
        if (!prevSaving.has(saveKey)) return prevSaving;
        const next = new Set(prevSaving);
        next.delete(saveKey);
        return next;
      });
    });
  }

  // One-click retry of the failed save captured in the alert: same value,
  // same question, same applicant. A Retry while that row is already saving
  // is ignored (the first write would double-fire), and if the rubric or the
  // queue changed under the alert — the question no longer exists, or the
  // applicant is gone — the alert describes nothing savable any more and is
  // dropped instead of retrying at nothing.
  function retryFailedScore() {
    if (!failedScore) return;
    if (
      savingScores.has(
        `${failedScore.applicantId}:${failedScore.questionId}`,
      )
    ) {
      return;
    }
    const question = questions.find((q) => q.id === failedScore.questionId);
    const stillListed = applicants.some(
      (a) => a.id === failedScore.applicantId,
    );
    if (!question || !stillListed) {
      setFailedScore(null);
      return;
    }
    saveScoreFor(failedScore.applicantId, question, failedScore.value);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Phase 1 Scoring Queue
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {viewMode === "technical-only"
              ? "Enter the Technical Skills score for each applicant. Scores save the moment you pick a value."
              : "Score each applicant against the active rubric. Scores save the moment you pick a value."}
          </p>
          {/* Progress lives in the title block as a slim inline strip rather
              than a full-width banner card: the counts answer "how much work
              is left" and belong beside the heading, not above a third
              chrome band pushing the workstation down the page. */}
          <div className="mt-3">
            <ProcessedRemainingCounter
              processed={processed}
              total={applicants.length}
            />
          </div>
        </div>
        <RefreshButton ariaLabel="Refresh scoring queue" />
      </div>

      {/* (The failed-save alert lives in the applicant header — see the
          role="alert" block below.) */}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className={mobilePane === "detail" ? "hidden lg:block" : "block"}>
          <ApplicantQueueList
            entries={entries}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              // Only meaningful below lg; harmless above it, where both panes
              // are always visible.
              setMobilePane("detail");
            }}
          />
        </div>

        {selected ? (
          // Crossfade keyed on the applicant: switching people replaces every
          // answer and every score at once, and an instant swap of a dense panel
          // gives no signal that the content changed rather than the page having
          // glitched. Opacity only, at the `fast` token — reviewers step through
          // this queue dozens of times an hour, so it must never feel like a wait.
          <motion.div
            key={selected.id}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: DURATION.fast, ease: EASE.out }
            }
            className={`space-y-4 ${
              mobilePane === "list" ? "hidden lg:block" : "block"
            }`}
          >
            {/* Back to the queue — below lg only, where the queue is off-screen. */}
            <button
              type="button"
              onClick={() => setMobilePane("list")}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary transition-opacity duration-150 ease-out hover:opacity-80 motion-reduce:transition-none lg:hidden"
            >
              <Icon name="arrow_back" className="text-base" />
              Back to queue
            </button>

            {/* Applicant header: name, this applicant's progress, (full mode
                only) the live weighted total, and the failed-save alert, in a
                rounded card like every other box on the page. A plain block in
                normal flow — it scrolls away with the page. */}
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  {/* tabIndex=-1 makes the heading a focus target without
                      putting it in the tab order; the ref+effect above move
                      focus here after each applicant switch. */}
                  <h2
                    ref={detailHeadingRef}
                    tabIndex={-1}
                    className="text-lg font-semibold text-foreground"
                  >
                    {selected.fullName}
                  </h2>
                  {/* Team-wide, like the queue's per-row counts: every
                      scorer's entries, not just this viewer's. */}
                  <p
                    className={`mt-0.5 flex items-center gap-1 text-xs font-medium tabular-nums ${
                      selectedComplete
                        ? "text-status-accepted"
                        : "text-neutral-500 dark:text-neutral-400"
                    }`}
                  >
                    {selectedComplete && (
                      <Icon name="check_circle" className="text-sm" />
                    )}
                    {selected.scoredCount}/{totalQuestions} scored
                  </p>
                </div>
                {viewMode === "full" && (
                  <WeightedTotalDisplay
                    total={selectedTotal}
                    max={coefficientTotal}
                    complete={selectedComplete}
                  />
                )}
              </div>

              {/* Failed-save alert: announced immediately by role="alert"
                  when it appears, and carrying a one-click Retry that
                  re-sends the exact failed write (same value, same question,
                  same applicant). Tinted with the rejected red; other rows'
                  content is not blocked. */}
              {failedScore && (
                /* Height-animated so a failed save reveals the alert as a
                   quick smooth push rather than a jump. */
                <motion.div
                  role="alert"
                  initial={reduced ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { duration: DURATION.fast, ease: EASE.out }
                  }
                  className="overflow-hidden"
                >
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-status-rejected/10 px-3 py-2 text-sm text-status-rejected">
                    <p className="min-w-0">
                      {failedScore.applicantId !== selected.id &&
                        failedName && (
                          <span className="font-semibold">
                            {failedName} —{" "}
                          </span>
                        )}
                      {failedScore.message}
                    </p>
                    <button
                      type="button"
                      onClick={retryFailedScore}
                      className="shrink-0 cursor-pointer rounded-lg border border-status-rejected/30 px-2.5 py-1 text-xs font-semibold text-status-rejected transition-colors duration-150 ease-out hover:bg-status-rejected/20 motion-reduce:transition-none dark:border-status-rejected/40 dark:hover:bg-status-rejected/30"
                    >
                      Retry save
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            <ApplicantProfile fields={skills} />

            {/* Answers column beside Scoring column, one aligned row per
                question in rubric order: `questions` is already narrowed by
                the server to just the Technical question for the
                technical-only viewer, so that view is a single row.

                The shared screening note closes the Scoring column, under the
                last score card (see <QuestionRows>). Same audience that
                scores the non-technical questions, so capped by canScreen:
                the technical-only viewer's payload never carries the note. */}
            <QuestionRows
              links={links}
              others={extras}
              note={
                caps.canScreen && (
                  <ScoringNote
                    key={selected.id}
                    campaignId={campaignId}
                    applicantId={selected.id}
                    initialNote={selected.note ?? ""}
                    draft={noteDrafts[selected.id]}
                    savedBaseline={noteBaselines[selected.id]}
                    onDraftChange={(value) => {
                      const applicantId = selected.id;
                      setNoteDrafts((prev) => ({
                        ...prev,
                        [applicantId]: value,
                      }));
                    }}
                    onSaved={(savedText) => {
                      const applicantId = selected.id;
                      setNoteBaselines((prev) => ({
                        ...prev,
                        [applicantId]: savedText,
                      }));
                      // Clear the divergent-draft entry once the server has
                      // acknowledged exactly this text — but keep any typing
                      // that happened while the save was in flight as a live
                      // unsaved draft instead of discarding it.
                      setNoteDrafts((prev) => {
                        if (prev[applicantId] === savedText) {
                          const next = { ...prev };
                          delete next[applicantId];
                          return next;
                        }
                        return prev;
                      });
                    }}
                  />
                )
              }
            >
              {questions.map((q) => (
                <QuestionRow
                  key={q.id}
                  question={q}
                  answer={rowAnswer(q, selected.rawFormData)}
                  value={selected.scores[q.id]}
                  editable={canEditQuestion(q, caps)}
                  saving={savingScores.has(`${selected.id}:${q.id}`)}
                  onSelect={(v) => score(q, v)}
                />
              ))}
            </QuestionRows>

            {viewMode === "technical-only" && (
              // Muted footnote, deliberately distinct from the transient
              // error treatment: 11px meta type under a hairline divider.
              <p className="border-t border-neutral-100 pt-2 text-[11px] text-neutral-500 dark:border-neutral-800/60 dark:text-neutral-400">
                Technical scorers only see identifying details, profile links,
                and skills.
              </p>
            )}
          </motion.div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-16 text-center dark:border-neutral-700 dark:bg-neutral-800/40">
            <Icon name="how_to_reg" className="text-[32px] text-neutral-300" />
            <p className="mt-2 text-sm font-medium text-foreground">
              No applicants to score
            </p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Submitted applicants for this campaign will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

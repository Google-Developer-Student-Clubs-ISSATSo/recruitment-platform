"use client";

import { useMemo, useState, useTransition } from "react";
import { motion } from "motion/react";

import { Icon } from "@/components/app-shell/icon";
import { RefreshButton } from "@/components/refresh-button";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";
import { computeWeightedTotal, totalCoefficient } from "@/lib/phase1-score";
import { savePhaseOneScore } from "./actions";
import { ApplicantQueueList, type QueueEntry } from "./ApplicantQueueList";
import { ApplicantAnswerPanel } from "@/components/applicant-answer-panel";
import { ScoringControl } from "./ScoringControl";
import { WeightedTotalDisplay } from "./WeightedTotalDisplay";
import { ProcessedRemainingCounter } from "./ProcessedRemainingCounter";
import {
  canEditQuestion,
  type Phase1Applicant,
  type Phase1Question,
  type UserCaps,
  type ViewMode,
} from "./types";

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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
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

  const entries: QueueEntry[] = applicants.map((a) => ({
    id: a.id,
    fullName: a.fullName,
    complete: a.scoredCount === totalQuestions,
    scoredCount: a.scoredCount,
    totalQuestions,
  }));

  const processed = entries.filter((e) => e.complete).length;
  const selected = applicants.find((a) => a.id === selectedId) ?? null;

  // Weighted total is only shown to full reviewers — the technical-only viewer
  // never receives the other questions' scores to compute it from.
  const selectedTotal =
    selected && viewMode === "full"
      ? computeWeightedTotal(questions, (id) => selected.scores[id]).total
      : 0;
  const selectedComplete = selected
    ? selected.scoredCount === totalQuestions
    : false;

  function score(question: Phase1Question, value: number) {
    if (!selected) return;
    const applicantId = selected.id;
    const prev = selected.scores[question.id];
    const wasScored = prev !== undefined;

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
    setError(null);

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
        setError(res.error);
      }
    });
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
        </div>
        <RefreshButton ariaLabel="Refresh scoring queue" />
      </div>

      <ProcessedRemainingCounter
        processed={processed}
        total={applicants.length}
      />

      {error && (
        <p className="rounded-lg bg-status-rejected/10 px-4 py-2 text-sm text-status-rejected">
          {error}
        </p>
      )}

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
              <Icon name="arrow_back" className="text-[18px]" />
              Back to queue
            </button>

            {/* Applicant header + (full mode only) live total */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-foreground">
                {selected.fullName}
              </h2>
              {viewMode === "full" && (
                <WeightedTotalDisplay
                  total={selectedTotal}
                  max={coefficientTotal}
                  complete={selectedComplete}
                />
              )}
            </div>

            {/* Reading pane beside scoring from lg up; stacked below, with the
                answers first — you read before you score. */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Reading pane */}
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                  {viewMode === "technical-only" ? "Applicant" : "Answers"}
                </h3>
                <ApplicantAnswerPanel
                  viewMode={viewMode}
                  fullName={selected.fullName}
                  questions={questions}
                  rawFormData={selected.rawFormData}
                />
              </section>

              {/* Compact scoring panel — renders one control per question in
                  `questions`, which the server already narrowed to just the
                  Technical Skills question for the technical-only viewer. */}
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                  Scoring
                </h3>
                <div className="space-y-2.5">
                  {questions.map((q) => {
                    const editable = canEditQuestion(q, caps);
                    return (
                      <div
                        key={q.id}
                        className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {q.text}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {q.requiresTechnicalScorer && (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                Technical
                              </span>
                            )}
                            <span className="text-[11px] text-neutral-400">
                              ×{q.coefficient}
                            </span>
                          </span>
                        </div>
                        <ScoringControl
                          noteScale={q.noteScale}
                          value={selected.scores[q.id]}
                          editable={editable}
                          pending={pending}
                          lockLabel={
                            q.requiresTechnicalScorer
                              ? "Scored by Technical Team"
                              : undefined
                          }
                          onSelect={(v) => score(q, v)}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
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

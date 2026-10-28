"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/app-shell/icon";
import { AnswerValue } from "@/components/applicant-answer-panel";
import { ScoringControl, fmtScale } from "./ScoringControl";
import type { ProfileField, RowAnswer } from "./row-data";
import type { Phase1Question } from "./types";

// Two columns — the applicant's answers on the left, the scoring controls on
// the right — but every scored question is ONE grid row spanning both: its
// answer card and its score card share that row's height, so question N's
// scale always sits level with question N's answer however long the answers
// above it run. (The old layout had two independent stacks that drifted apart
// after the first long answer.)
//
// <QuestionRows> owns the two-track grid; each <QuestionRow> is a subgrid of it.
// The switch to side-by-side follows the detail pane's own width (container
// query), not the viewport's: at a 1024px viewport the queue rail and sidebar
// leave the pane ~420px, too narrow for two columns. Below that the pair
// stacks — answer, then its score card.
//
// After the scored rows the Answers column continues with nothing beside it,
// in one "Other submitted answers" section: first `links` (GitHub, LinkedIn, then Soft/Other skills),
// then `others` — every submitted field that isn't a scored question or a
// profile field. The whole submission reads top to bottom in one column, and
// only the questions that carry a score get a card on the right.
//
// Column widths: Answers is capped at 90ch (the same cap as each answer box,
// so on a wide pane the score card stays right beside its answer instead of
// across an empty gutter), and Scoring is only as wide as its widest scale
// (13rem floor, so the note has room). Question labels and the note opt out of
// sizing the column (contain: inline-size) — otherwise one long question text
// would stretch the whole Scoring column back out. The columns sit 12px
// apart: each answer and its score read as one unit.
//
// `note` closes the Scoring column: in normal flow (never pinned), directly
// under the last score card, beside the start of "Other submitted answers".
export function QuestionRows({
  children,
  links,
  others,
  note,
}: {
  children: ReactNode;
  links: ProfileField[];
  others: [string, string][];
  note?: ReactNode;
}) {
  return (
    <div className="@container">
      <div className="grid gap-3 @xl:grid-cols-[minmax(0,90ch)_minmax(13rem,auto)] @xl:gap-x-3">
        {/* Column headers only make sense side by side; stacked, each answer
            is directly followed by its own score card. */}
        <h3 className="hidden text-xs font-semibold uppercase tracking-widest text-neutral-500 @xl:block dark:text-neutral-400">
          Answers
        </h3>
        <h3 className="hidden text-xs font-semibold uppercase tracking-widest text-neutral-500 @xl:block dark:text-neutral-400">
          Scoring
        </h3>
        <ol
          aria-label="Questions"
          className="grid gap-y-4 @xl:col-[1/-1] @xl:row-start-2 @xl:grid-cols-subgrid @xl:gap-x-3 @xl:gap-y-3"
        >
          {children}
        </ol>
        {(links.length > 0 || others.length > 0) && (
          // One section for everything submitted that isn't scored: the
          // GitHub / LinkedIn links first, then every other form question in
          // form order — the real form carries many more than test data does.
          <section
            aria-labelledby="phase1-other-answers"
            className="mt-3 @xl:col-start-1 @xl:row-start-3"
          >
            <h3
              id="phase1-other-answers"
              className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400"
            >
              Other submitted answers
            </h3>
            <ul className="space-y-3">
              {links.map((f) => (
                <li
                  key={f.key}
                  className="max-w-[90ch] rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <h4 className="flex items-center gap-1.5 text-base font-bold text-neutral-500 dark:text-neutral-300">
                    {f.icon && <Icon name={f.icon} className="text-sm" />}
                    {f.label}
                  </h4>
                  {f.value && f.kind === "link" ? (
                    <AnswerValue value={f.value} />
                  ) : f.value ? (
                    // Skills are free text, never run through link detection.
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {f.value}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-sm italic text-neutral-400">
                      Not provided
                    </p>
                  )}
                </li>
              ))}
              {others.map(([key, value]) => {
                const trimmed = value.trim();
                return (
                  <li
                    key={key}
                    className="max-w-[90ch] rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <h4 className="text-base font-bold text-neutral-500 dark:text-neutral-300">
                      {key}
                    </h4>
                    {trimmed ? (
                      <AnswerValue value={trimmed} />
                    ) : (
                      <p className="mt-1.5 text-sm italic text-neutral-400">
                        Not provided
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {note && (
          // Row 3, column 2: the first slot under the last score card. Stacked,
          // it simply follows everything else.
          <div className="max-w-[90ch] [contain:inline-size] @xl:col-start-2 @xl:row-start-3 @xl:max-w-none @xl:self-start">
            {note}
          </div>
        )}
      </div>
    </div>
  );
}

export function QuestionRow({
  question,
  answer,
  value,
  editable,
  saving,
  lockLabel,
  onSelect,
}: {
  question: Phase1Question;
  answer: RowAnswer;
  value: number | undefined;
  editable: boolean;
  saving: boolean;
  /** Why the control is read-only, when it is — e.g. "Phase 1 finalized". */
  lockLabel?: string;
  onSelect: (value: number) => void;
}) {
  const labelId = `phase1-q-${question.id}`;
  return (
    <li
      aria-labelledby={labelId}
      className="grid gap-2 @xl:col-span-2 @xl:grid-cols-subgrid @xl:gap-x-3"
    >
      {/* Answer card — sets the row's height. */}
      <div className="min-w-0 max-w-[90ch] rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <h4
          id={labelId}
          className="text-base font-bold text-neutral-500 dark:text-neutral-300"
        >
          {question.text}
        </h4>
        <RowAnswerBody answer={answer} />
      </div>

      {/* Score card: the question again (clamped — the full text is in the
          answer card level with it), weight, and the scale. self-start keeps
          it fitted to its content, top-aligned with its answer, instead of
          stretching into an empty box beside a long answer. */}
      <div className="flex min-w-0 max-w-[90ch] flex-col gap-2 self-start rounded-xl border border-neutral-200 bg-white px-4 py-3 @xl:max-w-none dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start gap-2">
          <span
            title={question.text}
            className="line-clamp-2 min-w-0 flex-1 text-sm font-medium text-neutral-500 [contain:inline-size] dark:text-neutral-300"
          >
            {question.text}
          </span>
          {question.requiresTechnicalScorer && (
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">
              Technical
            </span>
          )}
          <span className="shrink-0 text-xs font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
            ×{fmtScale(question.coefficient)}
          </span>
        </div>
        <ScoringControl
          label={`Score for ${question.text}`}
          noteScale={question.noteScale}
          value={value}
          editable={editable}
          saving={saving}
          lockLabel={
            lockLabel ??
            (question.requiresTechnicalScorer
              ? "Scored by Technical Team"
              : undefined)
          }
          onSelect={onSelect}
        />
      </div>
    </li>
  );
}

function RowAnswerBody({ answer }: { answer: RowAnswer }) {
  switch (answer.kind) {
    case "answer":
      return <AnswerValue value={answer.value} />;
    case "missing":
      return (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm italic text-status-pending">
          <Icon name="help" className="text-[16px]" />
          No answer found for this field
        </p>
      );
    case "profile":
      return (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Scored from the applicant&apos;s skills and profile links.
        </p>
      );
    case "no-form":
      return (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Reviewer judgment, no form answer.
        </p>
      );
  }
}

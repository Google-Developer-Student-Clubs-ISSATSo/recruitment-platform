"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/app-shell/icon";
import { Input } from "@/components/ui/input";
import { NoteScaleEditor } from "./NoteScaleEditor";
import type { QuestionDTO } from "./actions";

// A single editable question row, laid out as its own card in the columns the
// Stitch scoring_configuration screen defines: order/reorder, question details,
// coefficient, grade scale, delete. The column widths here are kept in lockstep
// with the header strip in ScoringConfigManager — change one and you must change
// the other or the headings stop lining up.
//
// Behaviour is unchanged: fully controlled by the manager, text and coefficient
// stream up live (so the running total updates as you type) and persist on blur;
// the note scale, the two toggles, and reordering persist immediately. Delete is
// guarded by a ConfirmDialog that explicitly warns when scores already reference
// the question (they cascade-delete).
export function QuestionRow({
  question,
  index,
  count,
  disabled,
  onTextInput,
  onCommitText,
  onCoefficientInput,
  onCommitCoefficient,
  onNoteScaleChange,
  onToggleActive,
  onToggleTechnical,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  question: QuestionDTO;
  index: number;
  count: number;
  disabled: boolean;
  onTextInput: (value: string) => void;
  onCommitText: () => void;
  onCoefficientInput: (value: number) => void;
  onCommitCoefficient: () => void;
  onNoteScaleChange: (next: number[]) => void;
  onToggleActive: (next: boolean) => void;
  onToggleTechnical: (next: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const hasScores = question.scoreCount > 0;

  // Coefficient input and grade-scale editor are each written ONCE and shown at
  // one breakpoint at a time via `hidden`/`lg:hidden` — never two live copies of
  // the same control. `display:none` fully removes the off-breakpoint instance
  // from layout, focus order and events, so this is the same "one control,
  // css-switched position" technique the app already uses for the Applicants
  // table vs. card list, not a duplicated, independently-interactive input.
  const coefficientField = (
    <div className="relative w-20">
      <Input
        type="number"
        min={0}
        step="any"
        value={question.coefficient}
        disabled={disabled}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          onCoefficientInput(Number.isNaN(n) ? 0 : n);
        }}
        onBlur={onCommitCoefficient}
        aria-label="Coefficient"
        className="pr-5 text-center tabular-nums"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400"
      >
        ×
      </span>
    </div>
  );

  const gradeScaleField = (
    <NoteScaleEditor
      value={question.noteScale}
      disabled={disabled}
      onChange={onNoteScaleChange}
    />
  );

  const deleteButton = (
    <button
      type="button"
      onClick={() => setDeleteOpen(true)}
      disabled={disabled}
      aria-label="Delete question"
      className="p-1 text-neutral-400 transition-colors duration-150 ease-out hover:text-status-rejected disabled:opacity-50 motion-reduce:transition-none"
    >
      <Trash2 className="size-[18px]" aria-hidden />
    </button>
  );

  return (
    // Below lg: a single flex column (reorder+details, then coefficient/grade
    // scale/delete on their own wrapped row) — the original layout packed five
    // fixed-width columns into one unbreakable row (40 + 128 + 224 + 48px of
    // shrink-0 columns alone), which overflowed well past 375px. At lg the inner
    // wrapper below collapses via `lg:contents`, handing its two children back
    // to THIS flex row so the five columns line up exactly as before — the
    // desktop layout is unchanged.
    <div
      className={`group flex flex-col gap-3 rounded-xl border border-neutral-200 px-4 py-4 transition-all duration-200 hover:shadow-md motion-reduce:transition-none dark:border-neutral-800 sm:px-6 lg:flex-row lg:items-start lg:gap-4 ${
        question.isActive
          ? "bg-white dark:bg-neutral-900"
          : "bg-neutral-50/60 dark:bg-neutral-950/30"
      }`}
    >
      <div className="flex items-start gap-3 lg:contents">
        {/* Order + reorder — the reference's drag handle column. Kept as
            explicit up/down controls because they are real, keyboard-reachable
            actions rather than the decorative handle in the mockup. */}
        <div className="flex w-10 shrink-0 flex-col items-center gap-0.5 pt-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={disabled || index === 0}
            aria-label="Move question up"
            className="text-neutral-300 transition-colors duration-150 ease-out hover:text-primary disabled:pointer-events-none disabled:opacity-30 group-hover:text-neutral-400 motion-reduce:transition-none dark:text-neutral-600"
          >
            <Icon name="keyboard_arrow_up" className="text-[20px]" />
          </button>
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 text-xs font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            {index + 1}
          </span>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={disabled || index === count - 1}
            aria-label="Move question down"
            className="text-neutral-300 transition-colors duration-150 ease-out hover:text-primary disabled:pointer-events-none disabled:opacity-30 group-hover:text-neutral-400 motion-reduce:transition-none dark:text-neutral-600"
          >
            <Icon name="keyboard_arrow_down" className="text-[20px]" />
          </button>
        </div>

        {/* Question details: the text itself, then the two toggles as its
            supporting line, then — below lg only — coefficient, grade scale and
            delete stacked in their own wrapped row. */}
        <div className="min-w-0 flex-1 space-y-2.5 pt-1">
          <Input
            value={question.text}
            disabled={disabled}
            onChange={(e) => onTextInput(e.target.value)}
            onBlur={onCommitText}
            placeholder="Question text"
            aria-label="Question text"
            className="font-medium"
          />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <ToggleRow
              label="Active"
              hint={question.isActive ? "Counted in the total" : "Excluded from the total"}
              on={question.isActive}
              disabled={disabled}
              onToggle={onToggleActive}
            />
            <ToggleRow
              label="Scored by Technical Scorer instead of TM Reviewers"
              hint={
                question.requiresTechnicalScorer
                  ? "Hidden from the Phase 1 Scoring Queue"
                  : undefined
              }
              on={question.requiresTechnicalScorer}
              disabled={disabled}
              onToggle={onToggleTechnical}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1 lg:hidden">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                Coefficient
              </p>
              {coefficientField}
            </div>
            <div className="min-w-[180px] flex-1">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                Grade scale
              </p>
              {gradeScaleField}
            </div>
            {deleteButton}
          </div>
        </div>
      </div>

      {/* lg and up: the original three fixed-width columns. */}
      <div className="hidden w-32 shrink-0 justify-center pt-1 lg:flex">
        {coefficientField}
      </div>
      <div className="hidden w-56 shrink-0 pl-2 pt-2 lg:block">
        {gradeScaleField}
      </div>
      <div className="hidden w-12 shrink-0 justify-end pt-2 lg:flex">
        {deleteButton}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this question?"
        description={
          hasScores ? (
            <>
              <strong>{question.text}</strong> already has{" "}
              <strong>
                {question.scoreCount} score{question.scoreCount === 1 ? "" : "s"}
              </strong>{" "}
              recorded against it. Deleting the question will{" "}
              <strong>permanently delete those scores too</strong> (they cascade
              with the question). This can&rsquo;t be undone.
            </>
          ) : (
            <>
              This permanently removes <strong>{question.text}</strong> from the
              rubric. No scores reference it yet, so nothing else is affected.
              This can&rsquo;t be undone.
            </>
          )
        }
        confirmLabel="Delete Question"
        cancelLabel="Keep Question"
        destructive
        onConfirm={onDelete}
      />
    </div>
  );
}

// A labeled switch — same visual language as the permission toggles elsewhere.
function ToggleRow({
  label,
  hint,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!on)}
      disabled={disabled}
      aria-pressed={on}
      className="flex items-center gap-2 text-left disabled:opacity-60"
    >
      <span
        className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 ease-out motion-reduce:transition-none ${
          on ? "bg-primary" : "bg-neutral-300 dark:bg-neutral-600"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white transition-transform duration-150 ease-out motion-reduce:transition-none ${
            on ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] text-foreground">{label}</span>
        {hint && (
          <span className="block text-[11px] text-neutral-400">{hint}</span>
        )}
      </span>
    </button>
  );
}

"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/app-shell/icon";
import { Input } from "@/components/ui/input";
import { NoteScaleEditor } from "./NoteScaleEditor";
import type { QuestionDTO } from "./actions";

// A single editable question row. Fully controlled by the manager: text and
// coefficient stream up live (so the running total updates as you type) and
// persist on blur; the note scale, the two toggles, and reordering persist
// immediately. Delete is guarded by a ConfirmDialog that explicitly warns when
// scores already reference the question (they cascade-delete).
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

  return (
    <div
      className={`border-b border-neutral-100 p-4 last:border-0 dark:border-neutral-800/60 ${
        question.isActive ? "" : "bg-neutral-50/60 dark:bg-neutral-950/30"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Reorder controls + order badge */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={disabled || index === 0}
            aria-label="Move question up"
            className="text-neutral-400 transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-30"
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
            className="text-neutral-400 transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-30"
          >
            <Icon name="keyboard_arrow_down" className="text-[20px]" />
          </button>
        </div>

        {/* Main body */}
        <div className="min-w-0 flex-1 space-y-3">
          {/* Text + coefficient + delete */}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Question
              </label>
              <Input
                value={question.text}
                disabled={disabled}
                onChange={(e) => onTextInput(e.target.value)}
                onBlur={onCommitText}
                placeholder="Question text"
              />
            </div>
            <div className="w-24 shrink-0">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Coefficient
              </label>
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
                className="tabular-nums"
              />
            </div>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={disabled}
              aria-label="Delete question"
              className="mt-6 text-neutral-400 transition-colors hover:text-status-rejected disabled:opacity-50"
            >
              <Trash2 className="size-[18px]" aria-hidden />
            </button>
          </div>

          {/* Note scale */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Note scale
            </label>
            <NoteScaleEditor
              value={question.noteScale}
              disabled={disabled}
              onChange={onNoteScaleChange}
            />
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
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
        </div>
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
        className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          on ? "bg-primary" : "bg-neutral-300 dark:bg-neutral-600"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white transition-transform ${
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

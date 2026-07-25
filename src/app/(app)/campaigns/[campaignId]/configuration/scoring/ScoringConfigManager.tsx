"use client";

import { useRef, useState, useTransition } from "react";

import { Icon } from "@/components/app-shell/icon";
import { QuestionRow } from "./QuestionRow";
import { CoefficientTotalIndicator } from "./CoefficientTotalIndicator";
import {
  createPhaseOneQuestion,
  deletePhaseOneQuestion,
  reorderPhaseOneQuestions,
  updatePhaseOneQuestion,
  type QuestionDTO,
} from "./actions";

// Client owner of the question list. Local state is the source of truth for the
// UI so edits (and the running total) feel instant; every change is persisted
// via a server action, and the server also revalidates the path so a full
// reload is always authoritative. Text/coefficient stream up live and persist
// on blur — a per-field baseline ref prevents a no-op blur from writing (and
// logging) an unchanged value. Toggles, note-scale edits, reordering, add and
// delete persist immediately.
export function ScoringConfigManager({
  campaignId,
  initialQuestions,
  sidebar,
}: {
  campaignId: string;
  initialQuestions: QuestionDTO[];
  /**
   * Rendered in the summary column under the Phase Summary card — the
   * thresholds form. Passed in as a slot rather than rendered as a sibling
   * because the summary numbers are derived from this component's live local
   * state, so the whole two-column layout has to be owned here.
   */
  sidebar?: React.ReactNode;
}) {
  const [questions, setQuestions] = useState<QuestionDTO[]>(initialQuestions);
  const [pending, startTransition] = useTransition();

  // Last-persisted text/coefficient per question id, so onBlur only writes when
  // the value actually changed. Seeded from the initial server data.
  const baseline = useRef(
    new Map(
      initialQuestions.map((q) => [
        q.id,
        { text: q.text, coefficient: q.coefficient },
      ]),
    ),
  );

  const activeTotal = questions
    .filter((q) => q.isActive)
    .reduce((sum, q) => sum + (Number.isFinite(q.coefficient) ? q.coefficient : 0), 0);

  function patchLocal(id: string, patch: Partial<QuestionDTO>) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    );
  }

  // Persist a patch immediately (toggles, note scale). Local state is already
  // updated by the caller; this just writes through and keeps the baseline in
  // sync for any text/coefficient included.
  function persist(id: string, patch: Parameters<typeof updatePhaseOneQuestion>[2]) {
    startTransition(async () => {
      await updatePhaseOneQuestion(campaignId, id, patch);
    });
  }

  function commitText(id: string) {
    const q = questions.find((x) => x.id === id);
    if (!q) return;
    const base = baseline.current.get(id);
    if (base && base.text === q.text) return; // unchanged — no write
    baseline.current.set(id, { text: q.text, coefficient: q.coefficient });
    persist(id, { text: q.text });
  }

  function commitCoefficient(id: string) {
    const q = questions.find((x) => x.id === id);
    if (!q) return;
    const base = baseline.current.get(id);
    if (base && base.coefficient === q.coefficient) return; // unchanged
    baseline.current.set(id, { text: q.text, coefficient: q.coefficient });
    persist(id, { coefficient: q.coefficient });
  }

  function toggleActive(id: string, next: boolean) {
    patchLocal(id, { isActive: next });
    persist(id, { isActive: next });
  }

  function toggleTechnical(id: string, next: boolean) {
    patchLocal(id, { requiresTechnicalScorer: next });
    persist(id, { requiresTechnicalScorer: next });
  }

  function changeNoteScale(id: string, next: number[]) {
    patchLocal(id, { noteScale: next });
    persist(id, { noteScale: next });
  }

  function move(id: string, dir: -1 | 1) {
    const idx = questions.findIndex((q) => q.id === id);
    const swapWith = idx + dir;
    if (idx < 0 || swapWith < 0 || swapWith >= questions.length) return;

    const reordered = [...questions];
    [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];
    // Re-stamp order so the displayed 1..N badges stay correct locally.
    const withOrder = reordered.map((q, i) => ({ ...q, order: i + 1 }));
    setQuestions(withOrder);

    startTransition(async () => {
      await reorderPhaseOneQuestions(
        campaignId,
        withOrder.map((q) => q.id),
      );
    });
  }

  function addQuestion() {
    startTransition(async () => {
      const created = await createPhaseOneQuestion(campaignId);
      baseline.current.set(created.id, {
        text: created.text,
        coefficient: created.coefficient,
      });
      setQuestions((prev) => [...prev, created]);
    });
  }

  function remove(id: string) {
    setQuestions((prev) =>
      prev
        .filter((q) => q.id !== id)
        .map((q, i) => ({ ...q, order: i + 1 })),
    );
    baseline.current.delete(id);
    startTransition(async () => {
      await deletePhaseOneQuestion(campaignId, id);
    });
  }

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon name="tune" className="text-[22px]" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Questionnaire Scoring Logic
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Define weights and acceptable grading scales for initial applicant
              screening.
            </p>
          </div>
        </div>
      </div>

      {/* Bento grid: the question list carries the width, the summary and
          thresholds sit alongside it rather than stacked underneath. */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 space-y-4 lg:col-span-8">
          {/* Column headings. Widths must track QuestionRow's columns. */}
          <div className="hidden items-center rounded-t-xl border-x border-t border-neutral-200 bg-neutral-50 px-6 py-3 lg:flex dark:border-neutral-800 dark:bg-neutral-950/40">
            <div className="w-10 shrink-0" />
            <div className="flex-1 px-4 text-[11px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
              Question Details
            </div>
            <div className="w-32 shrink-0 text-center text-[11px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
              Coefficient
            </div>
            <div className="w-56 shrink-0 pl-2 text-[11px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
              Grade Scale
            </div>
            <div className="w-12 shrink-0" />
          </div>

          {questions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800/40 dark:text-neutral-400">
              No questions yet. Use <strong>Add New Scored Question</strong> to
              start the rubric.
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q, i) => (
                <QuestionRow
                  key={q.id}
                  question={q}
                  index={i}
                  count={questions.length}
                  disabled={pending}
                  onTextInput={(value) => patchLocal(q.id, { text: value })}
                  onCommitText={() => commitText(q.id)}
                  onCoefficientInput={(value) =>
                    patchLocal(q.id, { coefficient: value })
                  }
                  onCommitCoefficient={() => commitCoefficient(q.id)}
                  onNoteScaleChange={(next) => changeNoteScale(q.id, next)}
                  onToggleActive={(next) => toggleActive(q.id, next)}
                  onToggleTechnical={(next) => toggleTechnical(q.id, next)}
                  onMoveUp={() => move(q.id, -1)}
                  onMoveDown={() => move(q.id, 1)}
                  onDelete={() => remove(q.id)}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={addQuestion}
            disabled={pending}
            className="group flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 py-4 text-neutral-500 transition-all duration-150 ease-out hover:border-primary hover:bg-primary/5 hover:text-primary disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none dark:border-neutral-700 dark:text-neutral-400"
          >
            <Icon
              name="add_circle"
              className="text-[20px] transition-transform duration-150 ease-out group-hover:scale-110 motion-reduce:transition-none"
            />
            <span className="text-[11px] font-semibold uppercase tracking-widest">
              Add New Scored Question
            </span>
          </button>
        </div>

        <div className="col-span-12 space-y-6 lg:col-span-4">
          <CoefficientTotalIndicator
            total={activeTotal}
            questionCount={questions.length}
            activeCount={questions.filter((q) => q.isActive).length}
          />
          {sidebar}
        </div>
      </div>
    </div>
  );
}

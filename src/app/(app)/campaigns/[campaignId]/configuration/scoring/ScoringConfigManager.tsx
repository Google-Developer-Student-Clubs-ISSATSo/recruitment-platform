"use client";

import { useRef, useState, useTransition } from "react";

import { Icon } from "@/components/app-shell/icon";
import { Button } from "@/components/ui/button";
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
}: {
  campaignId: string;
  initialQuestions: QuestionDTO[];
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
    <section className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 p-6 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon name="tune" className="text-[22px]" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Phase 1 scoring rubric
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Questions, coefficients, and note scales for this campaign.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={addQuestion} disabled={pending}>
          <Icon name="add" className="text-[18px]" />
          Add Question
        </Button>
      </div>

      {/* Running total */}
      <div className="p-6 pb-0">
        <CoefficientTotalIndicator total={activeTotal} />
      </div>

      {/* Question list */}
      <div className="p-6 pt-4">
        {questions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800/40 dark:text-neutral-400">
            No questions yet. Use <strong>Add Question</strong> to start the
            rubric.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
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
      </div>
    </section>
  );
}

// The Phase 1 weighted-total formula, in one place.
//
// Pure and dependency-free — no prisma import — so the client scoring queue can
// use the same function as the server ranking pass without dragging the pg stack
// into the browser bundle (the same split interview-note.ts / interview-note-
// store.ts already uses).
//
// This total is never read from a cache and, on any page that only *displays*
// it, never read from PhaseOneResult.weightedTotal either: it is recomputed from
// the live PhaseOneScore rows and the questions' current coefficients, matching
// the "live-computed, not stored" rule that governs interview-note AVGs and the
// capacity counts. PhaseOneResult.weightedTotal remains written by the ranking
// pass because ranking has to persist an ordering, but it is a *record of that
// pass*, not the source of truth for a score shown later — a coefficient edited
// after the last recalculation would leave it stale, and a reader that computes
// live cannot be stale.

export type WeightedQuestion = { id: string; coefficient: number };

export type WeightedTotal = {
  /** Σ (score × coefficient) over the questions that actually have a score. */
  total: number;
  /** How many of `questions` had a score — `=== questions.length` means complete. */
  scoredCount: number;
};

/**
 * Weighted total over exactly the questions passed in — callers hand in the
 * ACTIVE questions, so a score left behind by a since-deactivated question
 * contributes to neither the total nor the count.
 *
 * `scoreOf` is a lookup rather than a fixed shape because the two callers hold
 * scores differently: the server has `{ questionId, value }[]` rows, the client
 * a `Record<questionId, value>`. Keeping the formula indifferent to that is what
 * lets both share it.
 */
export function computeWeightedTotal(
  questions: readonly WeightedQuestion[],
  scoreOf: (questionId: string) => number | undefined,
): WeightedTotal {
  let total = 0;
  let scoredCount = 0;
  for (const q of questions) {
    const value = scoreOf(q.id);
    if (value === undefined) continue;
    total += value * q.coefficient;
    scoredCount += 1;
  }
  return { total, scoredCount };
}

/** Σ of every active coefficient — the denominator a total is read against. */
export function totalCoefficient(
  questions: readonly WeightedQuestion[],
): number {
  return questions.reduce((sum, q) => sum + q.coefficient, 0);
}

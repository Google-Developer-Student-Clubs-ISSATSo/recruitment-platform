// Which configured questions get an ANSWER CARD, and which rawFormData key each
// one's answer is read from. Extracted from ApplicantAnswerPanel so the Phase 2
// page shows exactly the same set of answers as the Phase 1 reading pane —
// re-deriving "the configured questions" a second time is how the two would
// quietly drift apart.
//
// Pure and dependency-free: imported by both a client component (the Phase 1
// answers panel) and a server page (Phase 2).

// A TM-internal judgment call with no CSV column behind it — its rawFormData
// lookup will never find anything, so its "No answer found" card reads like a
// data problem when it's actually expected. Scoped to this exact question by
// TEXT (not "any question with a null sourceField", which would also catch
// Technical Skills — a different question, not excluded here). Hidden from the
// answer panes only: the Phase 1 Scoring panel iterates its questions directly
// and still renders this one's editable score input.
export const NO_FORM_QUESTION_TEXT = "BIG YES VS BIG NO";

/** The question fields the answer panes need — narrower than Phase1Question. */
export type AnswerQuestion = {
  text: string;
  requiresTechnicalScorer: boolean;
  sourceField: string | null;
};

/**
 * What <ApplicantAnswerPanel> needs per question: the lookup fields above plus
 * an id for the React key.
 *
 * Declared here rather than in the component so the panel — which now serves
 * both the Phase 1 Scoring Queue and the Applicants answers dialog — does not
 * have to reach into either page's folder for a type. Phase1Question satisfies
 * it structurally, so its call site needed no change beyond the import path.
 */
export type AnswerPanelQuestion = AnswerQuestion & { id: string };

/**
 * The rawFormData key an answer is read from: the configured `sourceField` when
 * there is one, else the question text.
 *
 * Falling back to the text is load-bearing, not a nicety. Filtering on
 * `sourceField !== null` was a real bug: a campaign whose questions were
 * configured WITHOUT a sourceField mapping (all null — which is exactly how the
 * current campaigns are configured) filtered down to nothing and rendered a
 * blank panel. Most such questions are worded as the form's column header, so
 * the text lookup finds the real answer anyway.
 */
export function answerKey(question: AnswerQuestion): string {
  return question.sourceField ?? question.text;
}

/**
 * The questions that get an answer card: every ACTIVE question except the
 * technical one (gated to its own scorer, shown in the restricted view instead)
 * and the no-form judgment call above.
 */
export function answerQuestions<T extends AnswerQuestion>(
  questions: readonly T[],
): T[] {
  return questions.filter(
    (q) => !q.requiresTechnicalScorer && q.text !== NO_FORM_QUESTION_TEXT,
  );
}

/**
 * Every key ANY active question is configured to read from — technical
 * included, even though it has no card in the reading pane, because its answer
 * is still genuinely accounted for elsewhere (the Scoring panel). The
 * complement of this set within rawFormData is "Other Submitted Answers", which
 * Phase 2 deliberately does not show.
 */
export function configuredAnswerKeys(
  questions: readonly AnswerQuestion[],
): Set<string> {
  return new Set(questions.map(answerKey));
}

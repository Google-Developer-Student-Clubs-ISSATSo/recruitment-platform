// Shared shapes for the Phase 1 Scoring Queue. Kept in a plain (non-"use
// server") module so both the server page and the client components can import
// them without pulling the server actions into the client bundle.

export type Phase1Question = {
  id: string;
  text: string;
  coefficient: number;
  noteScale: number[];
  order: number;
  requiresTechnicalScorer: boolean;
  sourceField: string | null;
};

// How much of the applicant/scoring surface the current viewer gets:
//   - "full"           — reviewers (SCREEN_PHASE1): all answers + all controls
//   - "technical-only" — the Technical Scorer (ENTER_TECHNICAL_SCORE only):
//                        name + GitHub + LinkedIn, and only the Technical control
export type ViewMode = "full" | "technical-only";

export type Phase1Applicant = {
  id: string;
  fullName: string;
  // The submitted form data the viewer is allowed to see. In "full" mode this
  // is the whole CSV row (answers read by question.sourceField). In
  // "technical-only" mode the server sends ONLY the GitHub/LinkedIn keys — the
  // other 8 answers never leave the server.
  rawFormData: Record<string, unknown> | null;
  // questionId → entered value. "full": every active question's score.
  // "technical-only": only the Technical Skills question's score.
  scores: Record<string, number>;
  // How many of ALL active questions have a score (server-computed), across
  // every scorer — drives the completion indicator without exposing which
  // questions or whose values in the restricted view.
  scoredCount: number;
  weightedTotal: number | null;
};

// What the current viewer is allowed to do, resolved once on the server.
export type UserCaps = {
  canScreen: boolean; // SCREEN_PHASE1 — the non-technical questions
  canTechnical: boolean; // ENTER_TECHNICAL_SCORE — the Technical Skills question
};

// Whether a given question is editable by a viewer with these caps: the
// technical question follows ENTER_TECHNICAL_SCORE, everything else follows
// SCREEN_PHASE1. Single source of truth, used by both the UI (to render the
// control editable/read-only) and mirrored server-side (to enforce it).
export function canEditQuestion(
  question: Pick<Phase1Question, "requiresTechnicalScorer">,
  caps: UserCaps,
): boolean {
  return question.requiresTechnicalScorer ? caps.canTechnical : caps.canScreen;
}

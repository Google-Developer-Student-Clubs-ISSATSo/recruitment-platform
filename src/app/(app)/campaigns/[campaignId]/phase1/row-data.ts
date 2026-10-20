// Pure helpers that shape one applicant's submission into the scoring
// workstation's regions: the profile fields (skills, shown above the rows;
// GitHub/LinkedIn links, shown after them), one row per scored question, and
// the leftover "other" answers. Kept free of
// React so the derivation is obvious and the client component stays layout.

import {
  answerKey,
  configuredAnswerKeys,
  NO_FORM_QUESTION_TEXT,
} from "@/lib/phase1-answers";
import type { Phase1Question } from "./types";

// Identity and consent columns — the name is already the workstation heading,
// and the consent checkbox is never useful to a reviewer.
const FULL_NAME_FIELD = "Full name";
const TERMS_FIELD = "Terms and Conditions";

// Same lookup rule page.tsx uses to build the technical-only payload: form
// column titles vary per form ("Github Profile Link:", "GitHub link"), so a
// field is found by its normalised key containing the needle. Matching both
// the full CSV row and the pre-stripped technical-only record this way means
// one set of profile fields serves both view modes.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export type ProfileField = {
  key: string;
  label: string;
  // Links carry the same icons the old technical-only LinkCards used.
  icon: "code" | "link" | null;
  kind: "link" | "text";
  value: string;
};

const PROFILE_SPECS = [
  { needle: "github", label: "GitHub", icon: "code", kind: "link" },
  { needle: "linkedin", label: "LinkedIn", icon: "link", kind: "link" },
  { needle: "softskills", label: "Soft skills", icon: null, kind: "text" },
  { needle: "otherskills", label: "Other skills", icon: null, kind: "text" },
] as const;

// What sits on the left of a question's row, beside its score control.
export type RowAnswer =
  | { kind: "answer"; value: string }
  // Mapped to a form column, but the applicant left it blank or it is absent.
  | { kind: "missing" }
  // The Technical question: judged from the profile fields (skills and
  // links), never from a column of its own (the reading pane never showed one).
  | { kind: "profile" }
  // A TM-internal judgment call with no form column behind it at all.
  | { kind: "no-form" };

function readString(data: Record<string, unknown> | null, key: string) {
  const raw = data ? data[key] : undefined;
  return typeof raw === "string" ? raw.trim() : "";
}

export function rowAnswer(
  question: Phase1Question,
  rawFormData: Record<string, unknown> | null,
): RowAnswer {
  if (question.requiresTechnicalScorer) return { kind: "profile" };
  if (question.text === NO_FORM_QUESTION_TEXT) return { kind: "no-form" };
  const value = readString(rawFormData, answerKey(question));
  return value ? { kind: "answer", value } : { kind: "missing" };
}

/**
 * The profile header's fields, in a fixed order. A field appears only when the
 * submission actually carries that column, and never when a question is
 * configured to read from it (it is already that question's row).
 */
export function profileFields(
  questions: readonly Phase1Question[],
  rawFormData: Record<string, unknown> | null,
): ProfileField[] {
  const configured = configuredAnswerKeys(questions);
  const keys = Object.keys(rawFormData ?? {}).filter(
    (k) => !configured.has(k),
  );
  const fields: ProfileField[] = [];
  for (const spec of PROFILE_SPECS) {
    const key = keys.find((k) => norm(k).includes(spec.needle));
    if (!key) continue;
    fields.push({
      key,
      label: spec.label,
      icon: spec.icon,
      kind: spec.kind,
      value: readString(rawFormData, key),
    });
  }
  return fields;
}

/**
 * Every submitted field that is neither a configured question's answer, a
 * profile field, nor identity/consent — the read-only reference list below the
 * rows. Same exclusion rule ApplicantAnswerPanel's "Other Submitted Answers"
 * uses, minus the fields the profile header now owns.
 */
export function otherAnswers(
  questions: readonly Phase1Question[],
  rawFormData: Record<string, unknown> | null,
  profile: readonly ProfileField[],
): [string, string][] {
  const configured = configuredAnswerKeys(questions);
  const profileKeys = new Set(profile.map((f) => f.key));
  return Object.entries(rawFormData ?? {}).filter(
    ([key, value]) =>
      key !== FULL_NAME_FIELD &&
      key !== TERMS_FIELD &&
      !configured.has(key) &&
      !profileKeys.has(key) &&
      typeof value === "string",
  ) as [string, string][];
}

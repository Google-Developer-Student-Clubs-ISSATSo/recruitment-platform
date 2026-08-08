import { ApplicantStatus, Committee } from "@/generated/prisma/enums";
import { COMMITTEE_LABEL } from "@/lib/committee";

// The single definition of "what one application answer-set means". Every intake
// path goes through here: the CSV import (a whole file of these, see
// applicants/import/parse.ts) and the Google Form webhook (one at a time, see
// api/webhooks/applicant-submission). Pure — no database access — so each caller
// supplies its own duplicate-detection set and does its own writes, without the
// validation or the auto-reject rule ever forking in two.

// --- Form-question wording -------------------------------------------------
// The Google Form's question titles, which are also the CSV export's column
// headers for every question someone actually authored. Matched loosely (see
// normalizeQuestion below), never by ===, because a live Form's titles drift:
// stray double spaces, a trailing colon, a capitalisation edit, or extra prose
// appended to a question all leave the question meaning the same thing.
//
// The two columns Google generates itself — Timestamp and Email — are NOT
// matched by title at all in the CSV, because Google writes them in the Form
// owner's account language ("Horodateur", "Adresse e-mail" on this club's
// French-locale account). The CSV reads those two by position instead; see
// classifyCsv. The webhook gets the email from getRespondentEmail() and keys it
// as "Email", so a webhook-built rawFormData still matches a CSV-built one.
export const HEADER = {
  email: "Email",
  fullName: "Full name",
  isIssatso: "Are you an ISSATSO student?",
  // Prefix, not a full title: the live question has a P.S. sentence appended
  // after this text, so it is matched with startsWith rather than equality.
  committee:
    "Which one of our three committees do you think is most suitable for you",
} as const;

/**
 * A question title reduced to the form two titles are compared in: lowercased,
 * trimmed, runs of whitespace collapsed to one space, a trailing colon dropped.
 * Everything that survives is meaningful wording.
 */
export function normalizeQuestion(title: string): string {
  return title
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\s*:\s*$/, "");
}

/** Whether a form's question title means the same as one of our HEADER keys. */
export function matchesQuestion(title: string, expected: string): boolean {
  return normalizeQuestion(title) === normalizeQuestion(expected);
}

/**
 * The committee question, matched on its opening text. The real title continues
 * past HEADER.committee with a P.S. addressed to the applicant, and that tail is
 * free to be reworded without breaking intake.
 */
export function matchesCommitteeQuestion(title: string): boolean {
  return normalizeQuestion(title).startsWith(normalizeQuestion(HEADER.committee));
}

// Committee answer → enum, by abbreviation. The Form's three choices spell the
// abbreviation and the full name together ("TM ( Team Managment )" — the typo is
// really in the live Form), and the abbreviation is the stable half: the prose
// half gets edited, translated and typo-fixed between cycles. Matched as a whole
// token, not a substring, so nothing can match inside a longer word.
const COMMITTEE_TOKENS = Object.keys(COMMITTEE_LABEL) as Committee[];

/**
 * The committee an answer names, or null if it names none — or more than one,
 * which is as unresolvable as none and gets the same error row. Never guessed.
 */
function committeeFromAnswer(answer: string): Committee | null {
  const tokens = new Set(
    answer
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter(Boolean),
  );
  const matched = COMMITTEE_TOKENS.filter((c) => tokens.has(c));
  return matched.length === 1 ? matched[0] : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RowStatus = "import" | "auto_reject" | "duplicate" | "error";

/** One submission as it arrives, before any validation or mapping. */
export type RawRow = {
  /** 1-based position within the batch — always 1 for a single webhook call. */
  rowNumber: number;
  fullName: string;
  email: string;
  issatsoAnswer: string;
  committeeAnswer: string;
  /** Every answer, keyed by question wording. Stored verbatim as rawFormData. */
  rawFormData: Record<string, string>;
};

// What the preview table renders per row (light — no rawFormData).
export type PreviewRow = {
  rowNumber: number;
  fullName: string;
  email: string;
  issatsoAnswer: string;
  committeeLabel: string;
  status: RowStatus;
  reason?: string;
};

// Everything the commit step needs, per row. PreviewRow ⊂ ClassifiedRow.
export type ClassifiedRow = PreviewRow & {
  isIssatsoStudent: boolean | null;
  preferredCommittee: Committee | null;
  rawFormData: Record<string, string>;
};

/**
 * Read the four judged answers out of a full answer-set keyed by question
 * wording. Used by the webhook, which receives a flat object; the CSV path
 * reads them positionally by column index, having already resolved its header
 * row.
 */
export function rawRowFromFormData(
  rawFormData: Record<string, string>,
  rowNumber = 1,
): RawRow {
  // Scan the keys rather than index by them: the payload's titles are whatever
  // the live Form currently says, and only their normalized form is expected to
  // line up with ours.
  const find = (matches: (key: string) => boolean) => {
    const key = Object.keys(rawFormData).find(matches);
    return key === undefined ? "" : (rawFormData[key] ?? "");
  };
  return {
    rowNumber,
    fullName: find((k) => matchesQuestion(k, HEADER.fullName)),
    email: find((k) => matchesQuestion(k, HEADER.email)),
    issatsoAnswer: find((k) => matchesQuestion(k, HEADER.isIssatso)),
    committeeAnswer: find(matchesCommitteeQuestion),
    rawFormData,
  };
}

/**
 * Classify ONE submission — the whole intake rule set, in order:
 *   1. hard data errors (missing/unmappable values) — never guessed, never
 *      imported
 *   2. duplicate — its email is already in `existingEmails`
 *   3. auto-reject non-ISSATSO students; everything else imports
 *
 * `existingEmails` is the lowercased set of emails already taken in the target
 * campaign. The CSV path passes a pre-fetched set which it grows as it walks the
 * file (so an in-file repeat counts as a duplicate too); the webhook passes the
 * result of a single point query.
 */
export function classifyApplicantRow(
  row: RawRow,
  existingEmails: Set<string>,
): ClassifiedRow {
  const fullName = row.fullName.trim();
  const email = row.email.trim().toLowerCase();
  const issatsoAnswer = row.issatsoAnswer.trim();
  const committeeAnswer = row.committeeAnswer.trim();

  // Resolve the two mapped/validated fields up front. The ISSATSO choice is
  // matched on its first word, since the live Form's affirmative is "Yes, I am"
  // and its tail is the kind of wording that gets reworded; anything not
  // starting yes/no is still unrecognised rather than assumed.
  const isIssatsoStudent = /^yes/i.test(issatsoAnswer)
    ? true
    : /^no/i.test(issatsoAnswer)
      ? false
      : null;
  const preferredCommittee = committeeFromAnswer(committeeAnswer);
  const committeeLabel = preferredCommittee ?? committeeAnswer;

  const base = {
    rowNumber: row.rowNumber,
    fullName,
    email,
    issatsoAnswer,
    committeeLabel,
    isIssatsoStudent,
    preferredCommittee,
    rawFormData: row.rawFormData,
  };

  // 1) Hard data errors — never guess or import.
  const errors: string[] = [];
  if (!fullName) errors.push("missing full name");
  if (!email) errors.push("missing email");
  else if (!EMAIL_RE.test(email)) errors.push("invalid email");
  if (isIssatsoStudent === null)
    errors.push(`unrecognized ISSATSO answer "${issatsoAnswer || "(blank)"}"`);
  if (preferredCommittee === null)
    errors.push(`unrecognized committee "${committeeAnswer || "(blank)"}"`);

  if (errors.length > 0) {
    return { ...base, status: "error", reason: errors.join("; ") };
  }

  // 2) Duplicate — this email is already taken in the campaign.
  if (existingEmails.has(email)) {
    return { ...base, status: "duplicate" };
  }

  // 3) Auto-reject non-ISSATSO students; everything else imports.
  if (isIssatsoStudent === false) {
    return { ...base, status: "auto_reject" };
  }
  return { ...base, status: "import" };
}

/**
 * The Applicant fields a classified submission becomes. Only "import" and
 * "auto_reject" rows ever reach here. The status mapping lives here alone so
 * the batched CSV write and the single-row webhook write can't disagree that an
 * auto-reject lands as REJECTED_PHASE1 — and, at both call sites, gets no
 * PhaseOneResult, because there is nothing to score.
 */
export function applicantCreateData(row: ClassifiedRow, campaignId: string) {
  return {
    campaignId,
    fullName: row.fullName,
    email: row.email,
    isIssatsoStudent: row.isIssatsoStudent!,
    preferredCommittee: row.preferredCommittee!,
    status:
      row.status === "auto_reject"
        ? ApplicantStatus.REJECTED_PHASE1
        : ApplicantStatus.SUBMITTED,
  };
}

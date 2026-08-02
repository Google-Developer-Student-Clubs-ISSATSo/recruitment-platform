import { ApplicantStatus, Committee } from "@/generated/prisma/enums";
import { COMMITTEE_LABEL } from "@/lib/committee";

// The single definition of "what one application answer-set means". Every intake
// path goes through here: the CSV import (a whole file of these, see
// applicants/import/parse.ts) and the Google Form webhook (one at a time, see
// api/webhooks/applicant-submission). Pure — no database access — so each caller
// supplies its own duplicate-detection set and does its own writes, without the
// validation or the auto-reject rule ever forking in two.

// --- Exact form-question wording (authoritative, from the responses file) ----
// These are the CSV export's column headers AND the Google Form's question
// titles — the same strings by construction, since Sheets names the export
// columns after the questions. The webhook keys its payload by them too, so a
// webhook-built rawFormData is structurally identical to a CSV-built one and
// PhaseOneQuestion.sourceField lookups work the same either way.
export const HEADER = {
  email: "Email",
  fullName: "Full name",
  isIssatso: "Are you an ISSATSO student?",
  committee:
    "Which one of our three committees do you think is most suitable for you ?",
} as const;

// Committee answer → enum. Anything not listed is an error row, never guessed.
// Derived from COMMITTEE_LABEL rather than restated, so the answers accepted
// here and the committee names the outbound emails print stay one and the same.
const COMMITTEE_MAP: Record<string, Committee> = Object.fromEntries(
  Object.entries(COMMITTEE_LABEL).map(([value, label]) => [
    label,
    value as Committee,
  ]),
);

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
  const get = (key: string) => rawFormData[key] ?? "";
  return {
    rowNumber,
    fullName: get(HEADER.fullName),
    email: get(HEADER.email),
    issatsoAnswer: get(HEADER.isIssatso),
    committeeAnswer: get(HEADER.committee),
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

  // Resolve the two mapped/validated fields up front.
  const isIssatsoStudent =
    issatsoAnswer === "Yes" ? true : issatsoAnswer === "No" ? false : null;
  const preferredCommittee = COMMITTEE_MAP[committeeAnswer] ?? null;
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

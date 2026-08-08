import {
  HEADER,
  classifyApplicantRow,
  matchesCommitteeQuestion,
  matchesQuestion,
  type ClassifiedRow,
  type PreviewRow,
} from "@/lib/applicant-intake";

// CSV-specific parsing for the applicant import: turn a responses file into
// rows and hand each one to the shared classifier in @/lib/applicant-intake,
// which the Google Form webhook calls too — so the validation and the
// auto-reject rule exist in exactly one place. No database access and no
// "use server" — the server actions call these, passing in the set of emails
// that already exist in the campaign so duplicate detection stays
// campaign-scoped. Kept dependency-free (small, known format) with a strict
// RFC-4180-style parser that respects quoted fields and embedded newlines.

export { HEADER };
export type {
  ClassifiedRow,
  PreviewRow,
  RowStatus,
} from "@/lib/applicant-intake";

// Hard ceiling on an uploaded file. The whole CSV is read into memory as a
// string and parsed in one pass, so an unbounded upload is a memory-exhaustion
// vector. 5 MB is orders of magnitude above any real responses export (a few
// thousand rows of text), so a file past it is malformed or hostile, not real.
// Enforced on BOTH sides: the client rejects early for a good error, the server
// re-checks because the client can be bypassed.
export const MAX_CSV_BYTES = 5 * 1024 * 1024;

export type ImportSummary = {
  totalRows: number;
  imported: number;
  autoRejected: number;
  duplicatesSkipped: number;
  errors: number;
};

// RFC-4180-ish parser: handles quoted fields, escaped quotes (""), commas and
// newlines inside quotes, and both \n and \r\n line endings.
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c === "\r") {
      // ignore — handled by the \n branch
    } else {
      cur += c;
    }
  }
  // Trailing field/row with no final newline.
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

// Google writes the first two columns of a responses export itself, in the Form
// owner's account language — this club's account is French, so they export as
// "Horodateur" and "Adresse e-mail", not "Timestamp" and "Email". Their POSITION
// is the stable thing: with email collection enabled, Google always emits the
// timestamp first and the collected email second, ahead of every authored
// question. So these two are read by index and every other column by its title.
const I_TIMESTAMP = 0;
const I_EMAIL = 1;

// ...and are stored in rawFormData under these keys regardless of what the file
// called them, so a CSV-built rawFormData stays interchangeable with a
// webhook-built one (the Apps Script keys the same two answers this way).
const TIMESTAMP_KEY = "Timestamp";

/**
 * Parse and classify the whole file. `existingEmails` is the lowercased set of
 * emails already in this campaign; rows matching it (or an earlier row in the
 * same file) are flagged as duplicates. A required question column that isn't
 * there fails the whole file loudly, rather than mapping the wrong data.
 */
export function classifyCsv(
  csvText: string,
  existingEmails: Set<string>,
): { rows: ClassifiedRow[]; headerError: string | null } {
  const parsed = parseCSV(csvText);
  if (parsed.length === 0) {
    return { rows: [], headerError: "The file is empty." };
  }

  const header = parsed[0].map((h) => h.trim());
  const iName = header.findIndex((h) => matchesQuestion(h, HEADER.fullName));
  const iIss = header.findIndex((h) => matchesQuestion(h, HEADER.isIssatso));
  const iCom = header.findIndex(matchesCommitteeQuestion);

  const missing: string[] = [];
  if (iName < 0) missing.push(HEADER.fullName);
  if (iIss < 0) missing.push(HEADER.isIssatso);
  if (iCom < 0) missing.push(HEADER.committee);
  if (missing.length > 0) {
    return {
      rows: [],
      headerError: `The file is missing required column(s): ${missing.join(", ")}.`,
    };
  }

  // The email column is positional, so "is it there?" is a question about the
  // file's shape, not about a header name — an export narrower than two columns
  // cannot be a responses file with email collection turned on.
  if (header.length <= I_EMAIL) {
    return {
      rows: [],
      headerError:
        "This file has no email column. Export the responses from a Form with email collection enabled.",
    };
  }

  // Emails already taken, grown as the file is walked so an in-file repeat is a
  // duplicate too (the first occurrence wins). Copied rather than mutated in
  // place — the caller's set stays its own.
  const taken = new Set(existingEmails);
  const rows: ClassifiedRow[] = [];

  for (let r = 1; r < parsed.length; r++) {
    const cells = parsed[r];
    // Skip completely blank lines (e.g. a trailing newline).
    if (cells.every((c) => c.trim() === "")) continue;

    const get = (i: number) => (i < cells.length ? cells[i] : "");

    const rawFormData: Record<string, string> = {};
    header.forEach((h, i) => {
      // The two Google-generated columns are re-keyed to their canonical names;
      // the rest keep the question wording they were exported under, which is
      // what PhaseOneQuestion.sourceField is configured against.
      if (i === I_TIMESTAMP) rawFormData[TIMESTAMP_KEY] = get(i);
      else if (i === I_EMAIL) rawFormData[HEADER.email] = get(i);
      else rawFormData[h] = get(i);
    });

    const row = classifyApplicantRow(
      {
        rowNumber: rows.length + 1,
        fullName: get(iName),
        email: get(I_EMAIL),
        issatsoAnswer: get(iIss),
        committeeAnswer: get(iCom),
        rawFormData,
      },
      taken,
    );

    // Only a row that actually gets created claims its email, matching the
    // pre-extraction behaviour: an error row never blocks a later good one.
    if (row.status === "import" || row.status === "auto_reject") {
      taken.add(row.email);
    }
    rows.push(row);
  }

  return { rows, headerError: null };
}

export function summarize(rows: ClassifiedRow[]): ImportSummary {
  return {
    totalRows: rows.length,
    imported: rows.filter((r) => r.status === "import").length,
    autoRejected: rows.filter((r) => r.status === "auto_reject").length,
    duplicatesSkipped: rows.filter((r) => r.status === "duplicate").length,
    errors: rows.filter((r) => r.status === "error").length,
  };
}

// Drop the heavy fields before sending rows to the client for preview.
export function toPreviewRow(r: ClassifiedRow): PreviewRow {
  return {
    rowNumber: r.rowNumber,
    fullName: r.fullName,
    email: r.email,
    issatsoAnswer: r.issatsoAnswer,
    committeeLabel: r.committeeLabel,
    status: r.status,
    reason: r.reason,
  };
}

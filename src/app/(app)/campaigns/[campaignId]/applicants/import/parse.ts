import { Committee } from "@/generated/prisma/enums";
import { COMMITTEE_LABEL } from "@/lib/committee";

// Pure CSV parsing + row classification for the applicant import. No database
// access and no "use server" — the server actions call these, passing in the
// set of emails that already exist in the campaign so duplicate detection stays
// campaign-scoped. Kept dependency-free (small, known format) with a strict
// RFC-4180-style parser that respects quoted fields and embedded newlines.

// --- Exact CSV headers (authoritative wording from the responses file) ------
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

// Hard ceiling on an uploaded file. The whole CSV is read into memory as a
// string and parsed in one pass, so an unbounded upload is a memory-exhaustion
// vector. 5 MB is orders of magnitude above any real responses export (a few
// thousand rows of text), so a file past it is malformed or hostile, not real.
// Enforced on BOTH sides: the client rejects early for a good error, the server
// re-checks because the client can be bypassed.
export const MAX_CSV_BYTES = 5 * 1024 * 1024;

export type RowStatus = "import" | "auto_reject" | "duplicate" | "error";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse and classify the whole file. `existingEmails` is the lowercased set of
 * emails already in this campaign; rows matching it (or an earlier row in the
 * same file) are flagged as duplicates. Header is matched by exact name, so a
 * missing required column fails loudly rather than mapping the wrong data.
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
  const colOf = (name: string) => header.indexOf(name);
  const iEmail = colOf(HEADER.email);
  const iName = colOf(HEADER.fullName);
  const iIss = colOf(HEADER.isIssatso);
  const iCom = colOf(HEADER.committee);

  const missing: string[] = [];
  if (iEmail < 0) missing.push(HEADER.email);
  if (iName < 0) missing.push(HEADER.fullName);
  if (iIss < 0) missing.push(HEADER.isIssatso);
  if (iCom < 0) missing.push(HEADER.committee);
  if (missing.length > 0) {
    return {
      rows: [],
      headerError: `The file is missing required column(s): ${missing.join(", ")}.`,
    };
  }

  // Lowercased emails seen earlier in THIS file, so an in-file repeat is also a
  // duplicate (the first occurrence wins).
  const seenInFile = new Set<string>();
  const rows: ClassifiedRow[] = [];

  for (let r = 1; r < parsed.length; r++) {
    const cells = parsed[r];
    // Skip completely blank lines (e.g. a trailing newline).
    if (cells.every((c) => c.trim() === "")) continue;

    const rowNumber = rows.length + 1;
    const get = (i: number) => (i < cells.length ? cells[i] : "");

    const rawFormData: Record<string, string> = {};
    header.forEach((h, i) => {
      rawFormData[h] = get(i);
    });

    const fullName = get(iName).trim();
    const email = get(iEmail).trim().toLowerCase();
    const issatsoAnswer = get(iIss).trim();
    const committeeAnswer = get(iCom).trim();

    // Resolve the two mapped/validated fields up front.
    const isIssatsoStudent =
      issatsoAnswer === "Yes"
        ? true
        : issatsoAnswer === "No"
          ? false
          : null;
    const preferredCommittee = COMMITTEE_MAP[committeeAnswer] ?? null;
    const committeeLabel = preferredCommittee ?? committeeAnswer;

    const base = {
      rowNumber,
      fullName,
      email,
      issatsoAnswer,
      committeeLabel,
      isIssatsoStudent,
      preferredCommittee,
      rawFormData,
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
      rows.push({ ...base, status: "error", reason: errors.join("; ") });
      continue;
    }

    // 2) Duplicate — already in the campaign, or repeated earlier in the file.
    if (existingEmails.has(email) || seenInFile.has(email)) {
      rows.push({ ...base, status: "duplicate" });
      continue;
    }
    seenInFile.add(email);

    // 3) Auto-reject non-ISSATSO students; everything else imports.
    if (isIssatsoStudent === false) {
      rows.push({ ...base, status: "auto_reject" });
    } else {
      rows.push({ ...base, status: "import" });
    }
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

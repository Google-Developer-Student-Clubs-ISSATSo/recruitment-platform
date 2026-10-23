// Readers for the raw CSV answers kept on Applicant.rawFormData. Pure and
// dependency-free — safe to import from client components.
//
// These fields were never promoted to real columns, so every page that wants
// one reaches into the same Json blob by key. Centralised here so the key
// strings live in one place: the import writes them, and a rename in the form
// would otherwise have to be chased through each page separately.

/** The form header year of study is asked under, matched by normalised key. */
export const YEAR_OF_STUDY_FIELD = "Year of study";

/** The form header the current diploma is asked under, matched by normalised key. */
export const CURRENT_DIPLOMA_FIELD = "Current diploma";

/** Read a non-empty string field, or null. */
export function readFormString(
  data: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = data?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

// Headers are compared with case and punctuation stripped. An exact match was a
// real bug: the live form writes "Year of study:" and "Current Diploma:" — a
// trailing colon and a capital the exact key never matched, so the field read
// as blank on every page that showed it.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The trimmed answer under the first header `matches` accepts, or null. */
function readByHeader(
  data: unknown,
  matches: (normalisedKey: string) => boolean,
): string | null {
  const record = (data ?? null) as Record<string, unknown> | null;
  const key = Object.keys(record ?? {}).find((k) => matches(norm(k)));
  return key ? readFormString(record, key)?.trim() ?? null : null;
}

/** Year of study as entered on the form, or null when the answer was blank. */
export function readYearOfStudy(data: unknown): string | null {
  return readByHeader(data, (k) => k === norm(YEAR_OF_STUDY_FIELD));
}

/** Current diploma as entered on the form, or null when the answer was blank. */
export function readCurrentDiploma(data: unknown): string | null {
  return readByHeader(data, (k) => k === norm(CURRENT_DIPLOMA_FIELD));
}

/**
 * The Facebook profile link, or null. Found by its key containing "facebook"
 * rather than by one exact header — the same rule Phase 1 uses for
 * GitHub/LinkedIn, since link column titles vary per form ("Facebook link",
 * "Facebook Profile Link:").
 */
export function readFacebookLink(data: unknown): string | null {
  return readByHeader(data, (k) => k.includes("facebook"));
}

// Readers for the raw CSV answers kept on Applicant.rawFormData. Pure and
// dependency-free — safe to import from client components.
//
// These fields were never promoted to real columns, so every page that wants
// one reaches into the same Json blob by key. Centralised here so the exact key
// strings live in one place: the import writes them, and a rename in the form
// would otherwise have to be chased through each page separately.

/** The exact rawFormData key the CSV import writes year of study under. */
export const YEAR_OF_STUDY_FIELD = "Year of study";

/** Read a non-empty string field, or null. */
export function readFormString(
  data: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = data?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Year of study as entered on the form, or null when the answer was blank. */
export function readYearOfStudy(data: unknown): string | null {
  return readFormString(
    (data ?? null) as Record<string, unknown> | null,
    YEAR_OF_STUDY_FIELD,
  );
}

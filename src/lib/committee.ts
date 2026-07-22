import { Committee } from "@/generated/prisma/enums";

// The committees' full display names. Pure and dependency-free — imported by
// client components, the CSV import and the outbound emails alike.
//
// These exact strings are the answers applicants pick from on the application
// form, so the CSV import parses against them (see applicants/import/parse.ts,
// which derives its answer→enum map from this) and the acceptance email tells
// people which committee they joined using the same wording they chose from.
// One definition, so the two can never drift into disagreeing.
export const COMMITTEE_LABEL: Record<Committee, string> = {
  [Committee.MKT]: "Marketing (MKT)",
  [Committee.TM]: "Team Management (TM)",
  [Committee.EER]: "Events & External Relations (EER)",
};

/** Full label for a committee, e.g. "Marketing (MKT)". */
export function committeeLabel(committee: Committee): string {
  return COMMITTEE_LABEL[committee];
}

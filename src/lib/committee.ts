import { Committee } from "@/generated/prisma/enums";

// The committees' full display names. Pure and dependency-free — imported by
// client components, the CSV import and the outbound emails alike.
//
// These are the club's own names for the three committees, used wherever a
// committee is shown to a person — the acceptance email included.
//
// They are deliberately NOT what intake matches an applicant's answer against:
// the Form spells its choices its own way ("TM ( Team Managment )", typo and
// all), so applicant-intake.ts matches on the abbreviation — this record's keys,
// which are the enum values — rather than on these labels.
export const COMMITTEE_LABEL: Record<Committee, string> = {
  [Committee.MKT]: "Marketing (MKT)",
  [Committee.TM]: "Team Management (TM)",
  [Committee.EER]: "Events & External Relations (EER)",
};

/** Full label for a committee, e.g. "Marketing (MKT)". */
export function committeeLabel(committee: Committee): string {
  return COMMITTEE_LABEL[committee];
}

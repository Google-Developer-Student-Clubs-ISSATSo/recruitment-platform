// Pure Phase 2 helpers — entry-type presentation and the MKT skills tally.
// Imports nothing from the database layer, so the client components can use the
// same definitions the server page does (same split as interview-note.ts vs.
// interview-note-store.ts). Everything that touches prisma is in
// phase2-store.ts.

import { Phase2EntryType } from "@/generated/prisma/enums";

import type { IconName } from "@/components/app-shell/icon";

// ============ ENTRY TYPES ============

/**
 * The three entry sections, in display order. Colours come from the status
 * tokens and keep their established meaning: green = good, red = bad, and a
 * plain note is neutral rather than borrowing a decision colour it doesn't mean.
 */
export const PHASE2_SECTIONS = [
  {
    type: Phase2EntryType.NOTE,
    label: "Notes",
    /** Singular, for the "Add a…" affordance. */
    singular: "note",
    icon: "description",
    tone: "neutral",
  },
  {
    type: Phase2EntryType.RED_FLAG,
    label: "Red Flags",
    singular: "red flag",
    icon: "warning",
    tone: "rejected",
  },
  {
    type: Phase2EntryType.GREEN_FLAG,
    label: "Green Flags",
    singular: "green flag",
    icon: "check_circle",
    tone: "accepted",
  },
] as const satisfies readonly {
  type: Phase2EntryType;
  label: string;
  singular: string;
  icon: IconName;
  tone: "neutral" | "rejected" | "accepted";
}[];

export type Phase2Section = (typeof PHASE2_SECTIONS)[number];

/**
 * The two independently-toggled READ surfaces on Phase 2 (see
 * lib/phase2-visibility.ts for who may read each one).
 *
 * RED_FLAG and GREEN_FLAG deliberately collapse into one `"flags"` surface:
 * hiding a red flag while its counterbalancing green flag stayed readable would
 * misrepresent the applicant, so the club treats them as a single surface.
 *
 * This mapping lives HERE rather than beside the visibility rule because the
 * client cards need it to group their columns, and this is the module that is
 * safe for them to import — phase2-visibility.ts reaches LEAD_ROLE_COMMITTEE
 * through campaign-leads.ts, which imports prisma.
 */
export type Phase2Surface = "notes" | "flags";

/** Which surface an entry type belongs to — the only place that mapping lives. */
export function surfaceOfEntryType(type: Phase2EntryType): Phase2Surface {
  return type === Phase2EntryType.NOTE ? "notes" : "flags";
}

const ENTRY_TYPES = new Set<string>(Object.values(Phase2EntryType));

/** Narrow a client-supplied string to a real entry type. */
export function isPhase2EntryType(value: string): value is Phase2EntryType {
  return ENTRY_TYPES.has(value);
}

/**
 * Longest entry we'll store. Generous for a paragraph of context, bounded so a
 * scripted POST can't push an unbounded blob into an append-only table nobody
 * can delete from.
 */
export const PHASE2_ENTRY_MAX_LENGTH = 2000;

// ============ MKT SKILLS ============

/**
 * The rawFormData key the skills tally reads, confirmed against the real
 * imported rows rather than assumed: a comma-separated checkbox multi-select.
 *
 * It is the only skills field the tally reads. "Soft skills" and "Technical
 * skills" also exist on the form and are deliberately NOT read — the former is
 * cross-committee (Teamwork, Leadership, Communication describe any good
 * candidate), the latter belongs to the technical-scorer question. Whitelisting
 * a value that only ever appears in one of those fields therefore counts
 * nothing; that is expected, not a bug.
 */
export const OTHER_SKILLS_FIELD = "Other skills";

/** Split one comma-separated multi-select answer into trimmed, non-empty values. */
export function splitSkills(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Normalized match key for a skill value: trimmed, lowercased. */
function skillKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The whitelisted skills one applicant listed.
 *
 * A submitted value counts only if it matches (trimmed, case-insensitive) an
 * entry on the campaign's whitelist. Anything else is silently dropped — not an
 * "unknown skill" row, not an error: by the TM Lead's own list it simply isn't
 * an MKT skill.
 *
 * The value returned is the WHITELIST's spelling, not the applicant's, so the
 * table reads as the configured list rather than as whatever casing happened to
 * arrive first. De-duplicated per applicant, since the rows mean "how many
 * applicants have this skill", not "how many times was it submitted".
 */
export function mktSkillsOf(
  rawFormData: unknown,
  whitelist: readonly string[],
): string[] {
  const data = (rawFormData ?? null) as Record<string, unknown> | null;
  if (!data) return [];

  const approved = new Map(whitelist.map((s) => [skillKey(s), s.trim()]));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of splitSkills(data[OTHER_SKILLS_FIELD])) {
    const key = skillKey(value);
    const canonical = approved.get(key);
    if (canonical === undefined || seen.has(key)) continue;
    seen.add(key);
    out.push(canonical);
  }
  return out;
}

export type SkillCount = { skill: string; count: number };

/**
 * Per-skill applicant counts, computed live on every page load — never stored,
 * like every other figure on this app's read-only surfaces. That is what makes
 * the whitelist retroactive: adding a skill credits everyone who already listed
 * it on the very next load, with no per-applicant action.
 *
 * Only skills somebody actually listed get a row. A whitelisted skill nobody
 * has is left out rather than shown as a 0: the whitelist is configuration, and
 * a campaign whose form doesn't offer a configured skill at all — or offers it
 * in a field this tally doesn't read — would otherwise carry a permanent 0 row
 * that reads as missing data. The configured list is visible in full on the
 * Configuration page, which is where it belongs.
 *
 * Sorted by count descending, then alphabetically so equal counts hold a stable
 * order between loads.
 */
export function tallyMktSkills(
  applicants: readonly { rawFormData: unknown }[],
  whitelist: readonly string[],
): SkillCount[] {
  const counts = new Map<string, { skill: string; count: number }>();
  for (const a of applicants) {
    for (const skill of mktSkillsOf(a.rawFormData, whitelist)) {
      const key = skillKey(skill);
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { skill, count: 1 });
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.skill.localeCompare(b.skill),
  );
}

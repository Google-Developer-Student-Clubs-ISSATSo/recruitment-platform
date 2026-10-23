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
 * The form question the skills tally reads: a comma-separated checkbox
 * multi-select, with an "Other:" box whose typed text arrives in the same
 * comma list.
 *
 * Matched by normalised key PREFIX rather than exactly, because the live form
 * titles it "Other skills (designing, editing...)" — an exact "Other skills"
 * lookup found nothing on real imports and left the whole breakdown empty.
 *
 * It is the only skills field the tally reads. "Soft skills" and "Technical
 * skills" also exist on the form and are deliberately NOT read — the former is
 * cross-committee (Teamwork, Leadership, Communication describe any good
 * candidate), the latter belongs to the technical-scorer question. Whitelisting
 * a value that only ever appears in one of those fields therefore counts
 * nothing; that is expected, not a bug.
 */
export const OTHER_SKILLS_FIELD = "Other skills";

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The submitted Other-skills answer, whatever the form titled the question. */
function otherSkillsAnswer(data: Record<string, unknown>): unknown {
  const prefix = normKey(OTHER_SKILLS_FIELD);
  const key = Object.keys(data).find((k) => normKey(k).startsWith(prefix));
  return key === undefined ? undefined : data[key];
}

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

/** One applicant's Other-skills answer, split by where each value came from. */
export type ApplicantSkills = {
  /** Values matching the campaign's whitelist, in the WHITELIST's spelling. */
  listed: string[];
  /** Everything else — what the applicant typed into the form's "Other:" box. */
  writeIns: string[];
};

/**
 * The skills one applicant listed, split into whitelisted and written-in.
 *
 * The whitelist mirrors the form's checkbox options, so a value that matches
 * none of it (trimmed, case-insensitive) is the applicant's own "Other:" text.
 * Those used to be dropped; they are kept now, separately, so a skill the form
 * didn't offer still surfaces — while the whitelisted half stays exactly what
 * the TM Lead configured.
 *
 * Listed values use the whitelist's spelling, so the table reads as the
 * configured list rather than as whatever casing arrived first; write-ins keep
 * the applicant's own. Both are de-duplicated per applicant, since the counts
 * mean "how many applicants have this skill", not "how many times was it
 * submitted".
 */
export function mktSkillsOf(
  rawFormData: unknown,
  whitelist: readonly string[],
): ApplicantSkills {
  const data = (rawFormData ?? null) as Record<string, unknown> | null;
  const out: ApplicantSkills = { listed: [], writeIns: [] };
  if (!data) return out;

  const approved = new Map(whitelist.map((s) => [skillKey(s), s.trim()]));

  const seen = new Set<string>();
  for (const value of splitSkills(otherSkillsAnswer(data))) {
    const key = skillKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    const canonical = approved.get(key);
    if (canonical === undefined) out.writeIns.push(value);
    else out.listed.push(canonical);
  }
  return out;
}

/** Whether an applicant gave any Other-skills answer at all, listed or not. */
export function hasAnySkill(skills: ApplicantSkills): boolean {
  return skills.listed.length > 0 || skills.writeIns.length > 0;
}

export type SkillCount = {
  skill: string;
  count: number;
  /** True for an "Other:" write-in rather than a whitelisted option. */
  writeIn: boolean;
};

/**
 * Per-skill applicant counts, computed live on every page load — never stored,
 * like every other figure on this app's read-only surfaces. That is what makes
 * the whitelist retroactive: adding a skill credits everyone who already listed
 * it on the very next load, with no per-applicant action.
 *
 * Write-ins get rows too, flagged `writeIn` and grouped case-insensitively so
 * "photoshop" and "Photoshop" are one row (shown in the first spelling seen).
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
  const counts = new Map<string, SkillCount>();
  const add = (skill: string, writeIn: boolean) => {
    const key = skillKey(skill);
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { skill, count: 1, writeIn });
  };
  for (const a of applicants) {
    const { listed, writeIns } = mktSkillsOf(a.rawFormData, whitelist);
    for (const skill of listed) add(skill, false);
    for (const skill of writeIns) add(skill, true);
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.skill.localeCompare(b.skill),
  );
}

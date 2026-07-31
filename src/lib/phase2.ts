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

// The rawFormData keys the skills tally reads, confirmed against the real
// imported rows rather than assumed. Both are comma-separated multi-selects.
export const OTHER_SKILLS_FIELD = "Other skills";
export const SOFT_SKILLS_FIELD = "Soft skills";

/**
 * Which soft skills count as MKT-relevant.
 *
 * "Other skills" needs no such list — every value it can hold (Video/Audio
 * editing, Illustrator, Marketing) is media/design/marketing work, so the whole
 * field counts. "Soft skills" is cross-committee: Content writing and Public
 * speaking are MKT craft, while Teamwork / Leadership / Organization /
 * Communication describe any good candidate for any committee and would drown
 * the real signal if counted here.
 *
 * Matched case-insensitively on the trimmed value. A soft skill added to the
 * form later is EXCLUDED until it is added here — deliberately the safe
 * direction: a missing row is visibly missing, whereas silently counting
 * "Punctuality" as an MKT skill would quietly distort the table.
 */
export const MKT_SOFT_SKILLS: readonly string[] = [
  "Content writing",
  "Public speaking",
];

const MKT_SOFT_SKILL_KEYS = new Set(
  MKT_SOFT_SKILLS.map((s) => s.toLowerCase()),
);

/** Split one comma-separated multi-select answer into trimmed, non-empty values. */
export function splitSkills(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/**
 * The MKT-relevant skills one applicant listed: every "Other skills" value,
 * plus the allowlisted "Soft skills" ones. De-duplicated per applicant so an
 * applicant who somehow listed the same skill in both fields still counts once
 * toward it — the table's rows are "how many applicants have this skill", not
 * "how many times was it typed".
 */
export function mktSkillsOf(rawFormData: unknown): string[] {
  const data = (rawFormData ?? null) as Record<string, unknown> | null;
  if (!data) return [];

  const skills = [
    ...splitSkills(data[OTHER_SKILLS_FIELD]),
    ...splitSkills(data[SOFT_SKILLS_FIELD]).filter((s) =>
      MKT_SOFT_SKILL_KEYS.has(s.toLowerCase()),
    ),
  ];

  // Case-insensitive de-dupe that keeps the first spelling seen, so "Marketing"
  // and "marketing" collapse into one row rather than two.
  const seen = new Set<string>();
  return skills.filter((s) => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type SkillCount = { skill: string; count: number };

/**
 * Raw per-skill applicant counts, computed live on every page load — never
 * stored, like every other figure on this app's read-only surfaces.
 *
 * Deliberately raw counts only: no category rollup ("Design (total)"), which is
 * out of scope. Sorted by count descending, then alphabetically so equal counts
 * hold a stable order between loads.
 */
export function tallyMktSkills(
  applicants: readonly { rawFormData: unknown }[],
): SkillCount[] {
  const counts = new Map<string, { skill: string; count: number }>();
  for (const a of applicants) {
    for (const skill of mktSkillsOf(a.rawFormData)) {
      const key = skill.toLowerCase();
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { skill, count: 1 });
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.skill.localeCompare(b.skill),
  );
}

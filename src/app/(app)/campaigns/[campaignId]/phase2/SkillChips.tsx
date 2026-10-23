// One applicant's Other-skills answer as chips — shared by the MKT skills
// table, the "outside MKT" section and the ranked-list card, so a skill reads
// the same wherever it appears. Hook-free, usable from server or client.

/**
 * An "Other:" write-in, set apart from the whitelisted chips without putting
 * text in the chart colour: neutral ink and a dashed outline, with the chart's
 * write-in swatch as a dot so the charts and the chips read as one key.
 */
function WriteInChip({ skill }: { skill: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-xs font-semibold text-neutral-700 dark:border-neutral-600 dark:text-neutral-200">
      <span aria-hidden className="size-1.5 rounded-full bg-chart-writein" />
      {skill}
      <span className="sr-only">(written in under Other)</span>
    </span>
  );
}

/**
 * One chip per skill rather than a comma-joined string: an applicant can match
 * several, and the chips make the count of them readable at a glance.
 * Whitelisted skills first, then write-ins.
 */
export function SkillChips({
  listed,
  writeIns,
}: {
  listed: readonly string[];
  writeIns: readonly string[];
}) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {listed.map((skill) => (
        <span
          key={skill}
          className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary-text"
        >
          {skill}
        </span>
      ))}
      {writeIns.map((skill) => (
        <WriteInChip key={`w:${skill}`} skill={skill} />
      ))}
    </span>
  );
}

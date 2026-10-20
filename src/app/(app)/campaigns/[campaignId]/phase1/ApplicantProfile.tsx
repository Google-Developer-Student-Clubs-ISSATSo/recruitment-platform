"use client";

import type { ProfileField } from "./row-data";

// The applicant's skills (soft + other), as one compact block above the scored
// rows: reference material for every question (and part of the basis of the
// Technical score), so it reads once at the top instead of as rows with
// nothing to score. Two columns once the detail pane is wide enough to hold
// them; the name is not repeated here — it is the workstation heading above.
// The GitHub/LinkedIn links are not here: they sit in the Answers column,
// after the scored questions (see <QuestionRows>).
export function ApplicantProfile({ fields }: { fields: ProfileField[] }) {
  if (fields.length === 0) return null;
  return (
    <section aria-label="Skills" className="@container">
      <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 @md:grid-cols-2 dark:border-neutral-800 dark:bg-neutral-900">
        {fields.map((f) => (
          <div key={f.key} className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {f.label}
            </dt>
            <dd className="max-w-[90ch]">
              {f.value ? (
                // Free text, never run through link detection, and shown in
                // full like every answer on this page.
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {f.value}
                </p>
              ) : (
                <p className="mt-1 text-sm italic text-neutral-400">
                  Not provided
                </p>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

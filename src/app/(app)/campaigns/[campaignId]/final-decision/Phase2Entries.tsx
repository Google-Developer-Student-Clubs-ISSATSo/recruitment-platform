"use client";

import { Icon } from "@/components/app-shell/icon";
import { splitTimestamp } from "@/lib/activity-descriptions";
import type { DecisionRow } from "@/lib/final-decision";
import { PHASE2_SECTIONS } from "@/lib/phase2";

// Same tone mapping as the Phase 2 page's EntrySection — green = good, red =
// bad, a plain note stays neutral. Tokens only.
const TONE = {
  neutral: {
    header: "text-neutral-500 dark:text-neutral-400",
    entry: "border-neutral-200 dark:border-neutral-800",
  },
  rejected: {
    header: "text-status-rejected-text",
    entry: "border-status-rejected/30 bg-status-rejected/5",
  },
  accepted: {
    header: "text-status-accepted-text",
    entry: "border-status-accepted/30 bg-status-accepted/5",
  },
} as const;

/**
 * The applicant's Phase 2 notes, red flags and green flags, read-only.
 *
 * Writing stays on the Phase 2 page — the meeting reads the paper trail here,
 * it doesn't extend it. All three sections always render, for every viewer of
 * this page; the Phase 2 page's notes/flags visibility switches don't apply.
 */
export function Phase2Entries({ row }: { row: DecisionRow }) {
  return (
    <div className="mt-6">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
        Phase 2
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {PHASE2_SECTIONS.map((section) => {
          const tone = TONE[section.tone];
          const entries = row.phase2Entries.filter(
            (e) => e.type === section.type,
          );
          return (
            <div key={section.type} className="min-w-0">
              <h4
                className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${tone.header}`}
              >
                <Icon name={section.icon} className="text-[15px]" />
                {section.label}
                <span className="font-normal text-neutral-500 dark:text-neutral-400">
                  ({entries.length})
                </span>
              </h4>
              <div className="mt-2 space-y-2">
                {entries.length === 0 ? (
                  <p className="text-sm italic text-neutral-500 dark:text-neutral-400">
                    Nothing recorded.
                  </p>
                ) : (
                  entries.map((entry) => {
                    const { date, time } = splitTimestamp(entry.createdAtISO);
                    return (
                      <div
                        key={entry.id}
                        className={`rounded-lg border px-3 py-2 ${tone.entry}`}
                      >
                        <p className="whitespace-pre-wrap text-sm text-foreground">
                          {entry.text}
                        </p>
                        <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                          {entry.authorName} · {date}, {time.slice(0, 5)}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

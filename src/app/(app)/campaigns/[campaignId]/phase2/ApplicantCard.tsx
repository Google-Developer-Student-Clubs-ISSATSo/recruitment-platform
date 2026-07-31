"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { Icon } from "@/components/app-shell/icon";
import { committeeLabel } from "@/lib/committee";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";
import { PHASE2_SECTIONS } from "@/lib/phase2";
import type { Phase2Applicant } from "@/lib/phase2-store";
import { EntrySection } from "./EntrySection";

/**
 * Two decimals, or an em dash when the applicant has no total yet — the same
 * rendering Phase 1 Selection gives a null weightedTotal, since Phase 2 now
 * reads that same persisted column.
 */
function formatScore(score: number | null): string {
  return score === null ? "—" : (Math.round(score * 100) / 100).toFixed(2);
}

/**
 * One applicant: a header that is always visible (position, name, committee,
 * live score) and an expandable body holding their configured-question answers
 * and the three entry logs.
 *
 * Collapsed by default because the list is a ranking first — a reviewer scans
 * the order, then opens the one they're discussing. The flag counts stay on the
 * header so a red flag is never hidden behind a collapsed panel.
 */
export function ApplicantCard({
  campaignId,
  applicant,
  maxScore,
  authorName,
}: {
  campaignId: string;
  applicant: Phase2Applicant;
  maxScore: number;
  /** The signed-in member's display name, for optimistically-added entries. */
  authorName: string;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  const counts = PHASE2_SECTIONS.map((s) => ({
    section: s,
    count: applicant.entries.filter((e) => e.type === s.type).length,
  }));

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50 sm:px-6 dark:hover:bg-neutral-800/50"
      >
        <span className="w-7 shrink-0 text-sm font-bold tabular-nums text-neutral-400">
          {applicant.position}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground sm:text-base">
            {applicant.fullName}
          </span>
          <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
            {committeeLabel(applicant.preferredCommittee)}
          </span>
        </span>

        {/* Flag tallies — visible while collapsed, so a red flag can't hide. */}
        <span className="hidden items-center gap-2 sm:flex">
          {counts
            .filter((c) => c.count > 0)
            .map(({ section, count }) => (
              <span
                key={section.type}
                title={`${count} ${section.label.toLowerCase()}`}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  section.tone === "rejected"
                    ? "bg-status-rejected/10 text-status-rejected"
                    : section.tone === "accepted"
                      ? "bg-status-accepted/10 text-status-accepted"
                      : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                }`}
              >
                <Icon name={section.icon} className="text-[13px]" />
                {count}
              </span>
            ))}
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-base font-bold tabular-nums text-foreground sm:text-lg">
            {formatScore(applicant.score)}
            <span className="text-xs font-semibold text-neutral-400">
              {" "}
              / {Number(maxScore.toFixed(2))}
            </span>
          </span>
          {!applicant.complete && (
            <span className="block text-[11px] text-[color:var(--status-pending)]">
              Partial score
            </span>
          )}
        </span>

        <Icon
          name={open ? "expand_less" : "expand_more"}
          className="shrink-0 text-[20px] text-neutral-400"
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 1 } : { height: 0, opacity: 0 }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: DURATION.base, ease: EASE.out }
            }
            className="overflow-hidden border-t border-neutral-200 dark:border-neutral-800"
          >
            <div className="space-y-5 px-4 py-4 sm:px-6">
              {/* Read-only context. Only the configured, coefficient-bearing
                  questions — the unmapped "Other Submitted Answers" extras are
                  deliberately not shown here, and there is no scoring input
                  anywhere on this page: Phase 1 scoring is finished. */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Phase 1 Answers
                </h3>
                <div className="mt-2 space-y-3">
                  {applicant.answers.length === 0 ? (
                    <p className="text-sm italic text-neutral-400">
                      This campaign has no configured questions.
                    </p>
                  ) : (
                    applicant.answers.map((a) => (
                      <div key={a.questionId}>
                        <p className="text-sm font-semibold text-foreground">
                          {a.question}
                        </p>
                        {a.answer ? (
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                            {a.answer}
                          </p>
                        ) : (
                          <p className="mt-1 flex items-center gap-1.5 text-sm italic text-[color:var(--status-pending)]">
                            <Icon name="help" className="text-[16px]" />
                            No answer found for this field
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="grid gap-5 border-t border-neutral-200 pt-4 lg:grid-cols-3 dark:border-neutral-800">
                {PHASE2_SECTIONS.map((section) => (
                  <EntrySection
                    key={section.type}
                    campaignId={campaignId}
                    applicantId={applicant.id}
                    section={section}
                    entries={applicant.entries.filter(
                      (e) => e.type === section.type,
                    )}
                    authorName={authorName}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

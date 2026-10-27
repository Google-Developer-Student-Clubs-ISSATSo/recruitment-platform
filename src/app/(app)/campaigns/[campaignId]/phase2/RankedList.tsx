"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/app-shell/icon";
import { FilterChip } from "@/components/filter-chip";
import { Input } from "@/components/ui/input";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";
import { COMMITTEE_LABEL } from "@/lib/committee";
import { PHASE2_SECTIONS } from "@/lib/phase2";
import type { Phase2Applicant } from "@/lib/phase2-store";
import type { Committee } from "@/generated/prisma/enums";
import { ApplicantCard } from "./ApplicantCard";

const COMMITTEES = Object.keys(COMMITTEE_LABEL) as Committee[];
const RED_FLAG_TYPE = PHASE2_SECTIONS.find((s) => s.tone === "rejected")!.type;

const hasRedFlag = (a: Phase2Applicant) =>
  a.entries.some((e) => e.type === RED_FLAG_TYPE);

/**
 * The ranked list plus its name search.
 *
 * Filtering happens in the browser, over the applicants already rendered on the
 * page — unlike the Applicants table, which searches through the URL because it
 * only ever holds one server-side page of rows. This list is complete on first
 * load, so a round-trip per keystroke would buy nothing.
 *
 * Search narrows VISIBILITY only. The ranking is not recomputed and positions
 * are not renumbered: each card keeps the `position` the server gave it, so the
 * third-ranked applicant still reads as 3 when they're the only match. An empty
 * box shows everyone, in the original order.
 *
 * The committee chips and the "Has red flag" toggle narrow it the same way, for
 * the questions the discussion actually asks ("the TM applicants", "anyone
 * flagged"). The red-flag toggle only exists when the viewer can see flags at
 * all — filtering on data the server never sent them would quietly match
 * nobody.
 */
export function RankedList({
  campaignId,
  applicants,
  maxScore,
  showScores,
  canEditMktTests,
  authorName,
  showNotesColumn,
  showFlagsColumn,
}: {
  campaignId: string;
  applicants: Phase2Applicant[];
  maxScore: number;
  /** False for MKT/EER viewers — the scores were never sent; see getPhase2Data. */
  showScores: boolean;
  /** MKT committee only — everyone else sees the test links read-only. */
  canEditMktTests: boolean;
  authorName: string;
  /**
   * Whether each column exists for this viewer at all. Decided on the server
   * (see lib/phase2-visibility.ts) — false means the column is omitted, not
   * blanked, and the entries behind it were never sent.
   */
  showNotesColumn: boolean;
  showFlagsColumn: boolean;
}) {
  const [query, setQuery] = useState("");
  const [committee, setCommittee] = useState<Committee | null>(null);
  const [redFlagOnly, setRedFlagOnly] = useState(false);

  const term = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      applicants.filter(
        (a) =>
          (term === "" || a.fullName.toLowerCase().includes(term)) &&
          (committee === null || a.preferredCommittee === committee) &&
          (!redFlagOnly || hasRedFlag(a)),
      ),
    [applicants, term, committee, redFlagOnly],
  );
  const countFor = (c: Committee) =>
    applicants.filter((a) => a.preferredCommittee === c).length;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-neutral-400"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          aria-label="Search applicants by name"
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={committee === null} onClick={() => setCommittee(null)}>
          All ({applicants.length})
        </FilterChip>
        {COMMITTEES.map((c) => (
          <FilterChip
            key={c}
            active={committee === c}
            onClick={() => setCommittee(committee === c ? null : c)}
          >
            {c} ({countFor(c)})
          </FilterChip>
        ))}
        {showFlagsColumn && (
          <>
            <span
              aria-hidden
              className="mx-1 h-4 w-px bg-neutral-200 dark:bg-neutral-700"
            />
            <FilterChip
              active={redFlagOnly}
              onClick={() => setRedFlagOnly((v) => !v)}
            >
              Has red flag ({applicants.filter(hasRedFlag).length})
            </FilterChip>
          </>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          {term !== "" && committee === null && !redFlagOnly
            ? `No applicant matches “${query.trim()}”.`
            : "No applicant matches these filters."}
        </p>
      ) : (
        // Deliberately not keyed on the search term: re-keying would remount
        // every card on each keystroke, collapsing any the reviewer had opened.
        // Cards are keyed by applicant id, so filtering only adds and removes.
        <StaggerGroup className="space-y-4">
          {visible.map((applicant) => (
            <StaggerItem key={applicant.id}>
              <ApplicantCard
                campaignId={campaignId}
                applicant={applicant}
                maxScore={maxScore}
                showScores={showScores}
                canEditMktTests={canEditMktTests}
                authorName={authorName}
                showNotesColumn={showNotesColumn}
                showFlagsColumn={showFlagsColumn}
              />
            </StaggerItem>
          ))}
        </StaggerGroup>
      )}
    </div>
  );
}

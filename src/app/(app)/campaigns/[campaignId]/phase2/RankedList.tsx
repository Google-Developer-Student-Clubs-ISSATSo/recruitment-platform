"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/app-shell/icon";
import { Input } from "@/components/ui/input";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";
import type { Phase2Applicant } from "@/lib/phase2-store";
import { ApplicantCard } from "./ApplicantCard";

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
 */
export function RankedList({
  campaignId,
  applicants,
  maxScore,
  authorName,
}: {
  campaignId: string;
  applicants: Phase2Applicant[];
  maxScore: number;
  authorName: string;
}) {
  const [query, setQuery] = useState("");

  const term = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      term === ""
        ? applicants
        : applicants.filter((a) => a.fullName.toLowerCase().includes(term)),
    [applicants, term],
  );

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

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          No applicant matches “{query.trim()}”.
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
                authorName={authorName}
              />
            </StaggerItem>
          ))}
        </StaggerGroup>
      )}
    </div>
  );
}

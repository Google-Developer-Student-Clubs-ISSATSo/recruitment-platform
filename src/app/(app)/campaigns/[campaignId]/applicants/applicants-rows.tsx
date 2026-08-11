"use client";

import { useState } from "react";

import { Committee } from "@/generated/prisma/enums";
import { Icon } from "@/components/app-shell/icon";
import {
  AnimatedCardList,
  AnimatedTableBody,
} from "@/components/motion/table-slice";
import type { AnswerPanelQuestion } from "@/lib/phase1-answers";
import { StatusBadge } from "./status-badge";
import { AnswersDialog } from "./answers-dialog";
import type { ApplicantRow } from "./applicants-view";

// The two row layouts (dense table from md up, one card per applicant below it)
// plus the answers dialog they open. Split out of <ApplicantsView> — which stays
// a server component — because opening a row is client state.
//
// Both layouts render the SAME rows and open the SAME dialog, so a phone and a
// desktop can never disagree about what an applicant submitted. The layout
// reasoning for the table/card split itself is documented at each block below,
// unchanged from when it lived in the view.
export function ApplicantsRows({
  applicants,
  sliceSignature,
  emptyMessage,
  canViewAnswers,
  answerQuestions,
}: {
  applicants: ApplicantRow[];
  /** Changes exactly when paging/filtering produced new rows — drives the fade. */
  sliceSignature: string;
  emptyMessage: string;
  /**
   * VIEW_FULL_POOL. False means the server sent no `rawFormData` at all, so no
   * row is openable and no trigger is rendered — there is nothing to reveal.
   */
  canViewAnswers: boolean;
  answerQuestions: AnswerPanelQuestion[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Resolved from the CURRENT rows rather than held as state, so a row that
  // pages or filters away closes its dialog instead of stranding it over a
  // slice that no longer contains that applicant.
  const openApplicant = applicants.find((a) => a.id === openId) ?? null;

  return (
    <>
      {/* ── md and up: the dense table ──────────────────────────────────────
          This is the one genuinely tabular screen of the three, so it keeps a
          real <table>: five short fields per row, scanned down a column. That
          is the opposite of the campaign list, where there are a handful of
          items and each one is a destination worth a whole card. */}
      <div className="hidden md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Committee</th>
              <th className="px-5 py-3">ISSATSO</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <AnimatedTableBody
            signature={sliceSignature}
            className="divide-y divide-neutral-100 dark:divide-neutral-800/60"
          >
            {applicants.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-10 text-center text-sm italic text-neutral-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              applicants.map((a) => (
                <tr
                  key={a.id}
                  // Mouse convenience only — the real, keyboard-reachable
                  // control is the name button in the first cell. The <tr>
                  // deliberately takes no role/tabIndex: making it a button
                  // while it contains one would nest two controls.
                  onClick={canViewAnswers ? () => setOpenId(a.id) : undefined}
                  className={`transition-colors duration-150 ease-out hover:bg-neutral-50 motion-reduce:transition-none dark:hover:bg-neutral-800/40 ${
                    canViewAnswers ? "cursor-pointer" : ""
                  }`}
                >
                  <td className="px-5 py-3 font-medium text-foreground">
                    {canViewAnswers ? (
                      <button
                        type="button"
                        onClick={() => setOpenId(a.id)}
                        aria-label={`View ${a.fullName}'s answers`}
                        className="group/name inline-flex cursor-pointer items-center gap-1.5 text-left font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {a.fullName}
                        <Icon
                          name="description"
                          className="text-[15px] text-neutral-400 opacity-0 transition-opacity duration-150 ease-out group-hover/name:opacity-100 motion-reduce:transition-none"
                        />
                      </button>
                    ) : (
                      a.fullName
                    )}
                  </td>
                  <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                    {a.email}
                  </td>
                  <td className="px-5 py-3">
                    <CommitteeChip committee={a.preferredCommittee} />
                  </td>
                  <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                    {a.isIssatsoStudent ? "Yes" : "No"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))
            )}
          </AnimatedTableBody>
        </table>
      </div>

      {/* ── below md: one card per applicant ───────────────────────────────
          CHOSEN OVER a horizontally-scrolling table with a sticky name column,
          for three reasons:

          1. What this page is FOR at phone width is lookup — "what happened to
             this person?" — not cross-row comparison. Comparison is what the
             stat cards above and the Statistics page serve. A sticky column
             optimises for the use case that isn't happening here.
          2. Nothing has to be given up. There are only five fields and three
             of them are short (a committee chip, Yes/No, a status pill), so a
             card shows the complete row with no truncation. A sticky-column
             table would still be ~800px wide — two full screens of sideways
             scrolling per row — and the widest field, the email, is also the
             least worth comparing across rows.
          3. Two scroll axes on a touch screen fight each other: the horizontal
             drag and the vertical page scroll are easy to trigger by accident,
             and momentum scrolling under a sticky cell is visibly janky.

          Same rows, same server query, same status badges — only the layout
          differs, so nothing here can disagree with the table above it. */}
      <div className="md:hidden">
        {applicants.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm italic text-neutral-400">
            {emptyMessage}
          </p>
        ) : (
          <AnimatedCardList
            signature={sliceSignature}
            className="divide-y divide-neutral-100 dark:divide-neutral-800/60"
          >
            {applicants.map((a) => (
              <ApplicantCard
                key={a.id}
                applicant={a}
                onOpen={canViewAnswers ? () => setOpenId(a.id) : null}
              />
            ))}
          </AnimatedCardList>
        )}
      </div>

      <AnswersDialog
        applicant={openApplicant}
        questions={answerQuestions}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

/**
 * One applicant at phone width. Name first and loudest (it is what you searched
 * for), then the email on its own line where it has room to wrap without
 * dictating anyone else's width, then the shorter fields — with the status pill
 * up on the name row, because the status is the answer most lookups want.
 *
 * The whole card is the trigger when answers are readable, matching the Phase 2
 * card's full-width button rather than hiding a small tap target in a corner.
 */
function ApplicantCard({
  applicant,
  onOpen,
}: {
  applicant: ApplicantRow;
  /** Null when the viewer may not read answers — the card then isn't a button. */
  onOpen: (() => void) | null;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 font-semibold text-foreground">
          {applicant.fullName}
        </p>
        <StatusBadge status={applicant.status} />
      </div>

      {/* break-all rather than truncate: an email is worth reading in full, and
          a long one has nowhere else to go at 375px. */}
      <p className="break-all text-sm text-neutral-500 dark:text-neutral-400">
        {applicant.email}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <CommitteeChip committee={applicant.preferredCommittee} />
        {/* Spelled out rather than the table's bare "Yes"/"No", which only means
            anything under a column header the card doesn't have. */}
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {applicant.isIssatsoStudent ? "ISSATSO student" : "Not ISSATSO"}
        </span>
        {onOpen && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary">
            <Icon name="description" className="text-[14px]" />
            Answers
          </span>
        )}
      </div>
    </>
  );

  if (!onOpen) return <li className="space-y-2 px-4 py-4">{body}</li>;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${applicant.fullName}'s answers`}
        className="w-full cursor-pointer space-y-2 px-4 py-4 text-left transition-colors duration-150 ease-out hover:bg-neutral-50 motion-reduce:transition-none dark:hover:bg-neutral-800/40"
      >
        {body}
      </button>
    </li>
  );
}

/** The preferred-committee chip, shared by both layouts so they cannot drift. */
function CommitteeChip({ committee }: { committee: Committee }) {
  return (
    <span className="inline-flex rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
      {committee}
    </span>
  );
}

import { ApplicantStatus, Committee } from "@/generated/prisma/enums";
import type { AnswerPanelQuestion } from "@/lib/phase1-answers";
import { ImportPanel } from "./import/import-panel";
import { RefreshButton } from "@/components/refresh-button";
import { ApplicantsRows } from "./applicants-rows";
import { Pagination } from "./Pagination";
import {
  ApplicantsFilters,
  type ApplicantFilters,
} from "./applicants-filters";

export type ApplicantRow = {
  id: string;
  fullName: string;
  email: string;
  preferredCommittee: Committee;
  isIssatsoStudent: boolean;
  status: ApplicantStatus;
  /**
   * The complete submitted row, behind VIEW_FULL_POOL. Optional because the
   * server OMITS it from the query for a viewer without that permission rather
   * than sending it and hiding it — so `undefined` here means "not entitled",
   * and `null` means "entitled, but this applicant has no stored row".
   */
  rawFormData?: unknown;
};

// The applicants list: header + import action, stat cards, filter bar, and a
// paginated table with token-coloured status badges. Everything shown is decided
// server-side — this renders one page of an already-filtered query rather than
// filtering anything itself, so it is a plain server component.
//
// RESPONSIVE APPROACH: a real <table> from md up, and a stacked card per
// applicant below it — NOT a horizontally-scrolling table with a sticky name
// column. The reasoning is on the card list further down.
export function ApplicantsView({
  campaignId,
  applicants,
  canImport,
  targetCount,
  counts,
  matching,
  page,
  pageCount,
  pageSize,
  presentStatuses,
  filters,
  canViewAnswers,
  answerQuestions,
}: {
  campaignId: string;
  /** Just this page's rows. */
  applicants: ApplicantRow[];
  canImport: boolean;
  /** PhaseOneConfig.targetCount — null until Configuration sets one. */
  targetCount: number | null;
  /** Campaign-wide aggregates, independent of filters and paging. */
  counts: { total: number; shortlisted: number; rejected: number };
  /** How many rows match the current filters, across all pages. */
  matching: number;
  page: number;
  pageCount: number;
  pageSize: number;
  presentStatuses: ApplicantStatus[];
  filters: ApplicantFilters;
  /**
   * VIEW_FULL_POOL — the key whose description promises complete answers.
   * False means the rows above carry no `rawFormData` at all, so there is
   * nothing for a dialog to show and no trigger is rendered.
   */
  canViewAnswers: boolean;
  /** Configured questions the dialog labels answers with. Empty when gated. */
  answerQuestions: AnswerPanelQuestion[];
}) {
  const basePath = `/campaigns/${campaignId}/applicants`;
  const anyFilterActive = Boolean(
    filters.q || filters.status || filters.committee,
  );

  const first = matching === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + applicants.length;

  // Identifies the currently rendered slice. Both layouts re-run their fade when
  // this changes — i.e. exactly when paging or filtering produced new rows.
  const sliceSignature = `${page}|${filters.q}|${filters.status}|${filters.committee}`;

  const emptyMessage =
    counts.total === 0
      ? "No applicants in this campaign yet."
      : "No applicants match your filters.";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Applicants</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {counts.total} applicant{counts.total === 1 ? "" : "s"} in this
            campaign.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Safe here: every row renders straight from server props — the only
              client state in <ApplicantsRows> is which dialog is open. */}
          <RefreshButton ariaLabel="Refresh applicant list" />
          {canImport && <ImportPanel campaignId={campaignId} />}
        </div>
      </div>

      {/* Stat cards — campaign-wide totals from their own count queries, so they
          read the same on every page and under every filter.
          Two columns at 375px rather than one: these are four short numbers, and
          stacking them into a four-high tower would push the table itself below
          the fold on a phone for no gain. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Shortlisted" value={counts.shortlisted} tone="primary" />
        <StatCard
          label="Rejected (Phase 1)"
          value={counts.rejected}
          tone="rejected"
        />
        {/* The plan, not a headcount: how many the club intends to accept,
            straight from PhaseOneConfig. "—" until Configuration sets it. */}
        <StatCard label="Target Quota" value={targetCount ?? "—"} />
      </div>

      <ApplicantsFilters
        basePath={basePath}
        filters={filters}
        presentStatuses={presentStatuses}
      />

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        {/* Both row layouts and the answers dialog they open — a client island,
            since opening a row is client state. See applicants-rows.tsx for the
            table-vs-card reasoning that used to live here. */}
        <ApplicantsRows
          applicants={applicants}
          sliceSignature={sliceSignature}
          emptyMessage={emptyMessage}
          canViewAnswers={canViewAnswers}
          answerQuestions={answerQuestions}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-4 py-3 sm:px-5 dark:border-neutral-800 dark:bg-neutral-950/40">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            Showing {first}–{last} of {matching}
            {anyFilterActive ? " matching" : ""} applicant
            {matching === 1 ? "" : "s"}
          </span>
          {pageCount > 1 && (
            // basePath + filters rather than a pageHref callback: <Pagination>
            // is a client component (it animates the active-page pill), and a
            // function prop cannot cross the server/client boundary.
            <Pagination
              page={page}
              pageCount={pageCount}
              basePath={basePath}
              filters={filters}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  /** A string lets an unconfigured value render as "—" rather than 0. */
  value: number | string;
  tone?: "primary" | "rejected";
}) {
  const valueColor =
    tone === "primary"
      ? "text-primary"
      : tone === "rejected"
        ? "text-status-rejected"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
      {/* "Rejected (Phase 1)" is the long one — it wraps to two lines in a
          ~160px column at 375px, so the label gets leading-tight and the value
          sits underneath rather than being pushed around. */}
      <p className="mb-1 text-xs leading-tight text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      <p className={`text-xl font-bold tabular-nums sm:text-2xl ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}

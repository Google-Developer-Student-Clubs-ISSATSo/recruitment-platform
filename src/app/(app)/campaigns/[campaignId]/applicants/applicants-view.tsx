import { ApplicantStatus, Committee } from "@/generated/prisma/enums";
import { StatusBadge } from "./status-badge";
import { ImportPanel } from "./import/import-panel";
import {
  AnimatedCardList,
  AnimatedTableBody,
} from "@/components/motion/table-slice";
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
        {canImport && <ImportPanel campaignId={campaignId} />}
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
                    className="transition-colors duration-150 ease-out hover:bg-neutral-50 motion-reduce:transition-none dark:hover:bg-neutral-800/40"
                  >
                    <td className="px-5 py-3 font-medium text-foreground">
                      {a.fullName}
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
                <ApplicantCard key={a.id} applicant={a} />
              ))}
            </AnimatedCardList>
          )}
        </div>

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

/**
 * One applicant at phone width. Name first and loudest (it is what you searched
 * for), then the email on its own line where it has room to wrap without
 * dictating anyone else's width, then the shorter fields — with the status pill
 * up on the name row, because the status is the answer most lookups want.
 */
function ApplicantCard({ applicant }: { applicant: ApplicantRow }) {
  return (
    <li className="space-y-2 px-4 py-4">
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
      </div>
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

"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/app-shell/icon";
import { PhaseOneClassification } from "@/generated/prisma/enums";
import {
  finalizePhaseOneAction,
  recalculateRankingAction,
  resolveToDiscussAction,
} from "./actions";
import { ClassificationBadge } from "./classification-badge";

export type SelectionRow = {
  applicantId: string;
  fullName: string;
  weightedTotal: number | null;
  rank: number | null;
  classification: PhaseOneClassification;
  complete: boolean;
};

// Typed as the full enum so `.includes()` accepts any classification — the
// inferred literal-union element type would reject everything else.
const ACCEPTED: readonly PhaseOneClassification[] = [
  PhaseOneClassification.AUTO_ACCEPT,
  PhaseOneClassification.MANUAL_ACCEPT,
];
const REJECTED: readonly PhaseOneClassification[] = [
  PhaseOneClassification.AUTO_REJECT,
  PhaseOneClassification.MANUAL_REJECT,
];

type Filter = "ALL" | "ACCEPT" | "TO_DISCUSS" | "REJECT" | "PENDING";
type SortKey = "rank" | "name" | "total";

/**
 * Which dialog is open, if any.
 *   recalc-confirm  — the extra gate on recalculating an already-finalized phase
 *   refinalize-warn — the extra gate before re-opening the finalize confirm
 *   finalize-confirm— the real "this will shortlist N / reject M" commit dialog
 * Once finalized, both destructive paths pick up an extra step: applicants may
 * already have been emailed their outcome by then, so neither is routine.
 */
type Dialog = null | "recalc-confirm" | "refinalize-warn" | "finalize-confirm";

function matchesFilter(row: SelectionRow, filter: Filter): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "ACCEPT":
      return ACCEPTED.includes(row.classification);
    case "REJECT":
      return REJECTED.includes(row.classification);
    case "TO_DISCUSS":
      return row.classification === PhaseOneClassification.TO_DISCUSS;
    case "PENDING":
      return row.classification === PhaseOneClassification.PENDING;
  }
}

function formatTotal(total: number | null): string {
  return total === null ? "—" : (Math.round(total * 100) / 100).toFixed(2);
}

/** UTC-derived date so server and client agree — no hydration mismatch. */
function formatFinalizedAt(iso: string): string {
  const [date, rest] = iso.split("T");
  return `${date} at ${(rest ?? "").slice(0, 5)} UTC`;
}

export function SelectionClient({
  campaignId,
  initialRows,
  targetCount,
  rejectThreshold,
  buffer,
  finalizedAtISO,
}: {
  campaignId: string;
  initialRows: SelectionRow[];
  targetCount: number | null;
  rejectThreshold: number | null;
  buffer: number | null;
  finalizedAtISO: string | null;
}) {
  // Rows come straight from the server on every render: each action calls
  // revalidatePath, so the RSC payload is the single source of truth. Mirroring
  // them into state here would just risk showing a stale ranking after a
  // recalculation.
  const rows = initialRows;

  const [filter, setFilter] = useState<Filter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const finalized = finalizedAtISO !== null;

  // ConfirmDialog fires onConfirm() and then onOpenChange(false). The
  // re-finalize gate's onConfirm opens the *next* dialog, so a naive
  // `() => setDialog(null)` close handler would immediately wipe the dialog that
  // was just queued and the chain would dead-end. Only ever close the dialog
  // that's actually still showing.
  const closeIf = (which: Dialog) => (open: boolean) => {
    if (!open) setDialog((prev) => (prev === which ? null : prev));
  };

  const counts = useMemo(() => {
    const accepted = rows.filter((r) => ACCEPTED.includes(r.classification)).length;
    const rejected = rows.filter((r) => REJECTED.includes(r.classification)).length;
    const toDiscuss = rows.filter(
      (r) => r.classification === PhaseOneClassification.TO_DISCUSS,
    ).length;
    const pendingRows = rows.filter(
      (r) => r.classification === PhaseOneClassification.PENDING,
    ).length;
    const complete = rows.filter((r) => r.complete).length;
    return {
      accepted,
      rejected,
      toDiscuss,
      pending: pendingRows,
      complete,
      incomplete: rows.length - complete,
    };
  }, [rows]);

  // Default reading order: the contested ranking first, then the below-threshold
  // rejects (which never get a rank) by score, then whoever isn't fully scored.
  const visible = useMemo(() => {
    const filtered = rows.filter((r) => matchesFilter(r, filter));
    const sorted = [...filtered];
    if (sortKey === "name") {
      sorted.sort((a, b) => a.fullName.localeCompare(b.fullName));
    } else if (sortKey === "total") {
      sorted.sort((a, b) => (b.weightedTotal ?? -1) - (a.weightedTotal ?? -1));
    } else {
      sorted.sort((a, b) => {
        if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
        if (a.rank !== null) return -1;
        if (b.rank !== null) return 1;
        if (a.complete !== b.complete) return a.complete ? -1 : 1;
        return (b.weightedTotal ?? -1) - (a.weightedTotal ?? -1);
      });
    }
    return sorted;
  }, [rows, filter, sortKey]);

  function doRecalculate() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await recalculateRankingAction(campaignId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(
        `Ranking recalculated — ${res.completeCount} fully scored, ${res.incompleteCount} still incomplete.`,
      );
    });
  }

  function doFinalize() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await finalizePhaseOneAction(campaignId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(
        `Phase 1 finalized — ${res.shortlisted} shortlisted, ${res.rejected} rejected` +
          (res.stillPending > 0 ? `, ${res.stillPending} left pending.` : "."),
      );
    });
  }

  function resolve(applicantId: string, outcome: "ACCEPT" | "REJECT") {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await resolveToDiscussAction(campaignId, applicantId, outcome);
      if (!res.ok) setError(res.error);
    });
  }

  // Finalize is blocked only by unresolved discussions — an applicant nobody has
  // decided on has no outcome to write. Incomplete applicants warn but don't
  // block: leaving them behind is a legitimate call, since scoring may never
  // reach everyone.
  const blockedReason =
    counts.toDiscuss > 1
      ? `Resolve all ${counts.toDiscuss} “to discuss” applicants before finalizing.`
      : counts.toDiscuss === 1
        ? "Resolve the last “to discuss” applicant before finalizing."
        : rows.length === 0
          ? "There are no applicants to finalize."
          : null;
  const canFinalize = blockedReason === null && !pending;

  const targetLabel =
    targetCount === null
      ? `${counts.accepted} accepted — no target configured`
      : counts.accepted === targetCount
        ? `${counts.accepted} / ${targetCount} target reached`
        : counts.accepted < targetCount
          ? `${counts.accepted} / ${targetCount} — ${targetCount - counts.accepted} more needed`
          : `${counts.accepted} / ${targetCount} — ${counts.accepted - targetCount} over target`;

  const onTarget = targetCount !== null && counts.accepted === targetCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">
            Phase 1 Selection &amp; Ranking
          </h1>
          <p className="max-w-xl text-sm text-neutral-500 dark:text-neutral-400">
            Rank fully-scored applicants, resolve the borderline cases the buffer
            flags for discussion, then commit the shortlist.
          </p>
        </div>
        {targetCount !== null && rejectThreshold !== null && buffer !== null && (
          <dl className="flex gap-6 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
                Target
              </dt>
              <dd className="font-semibold text-foreground">{targetCount}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
                Reject below
              </dt>
              <dd className="font-semibold text-foreground">{rejectThreshold}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
                Buffer
              </dt>
              <dd className="font-semibold text-foreground">±{buffer}</dd>
            </div>
          </dl>
        )}
      </div>

      {/* Finalized banner */}
      {finalized && (
        <div className="flex items-start gap-3 rounded-xl border border-status-accepted/30 bg-status-accepted/10 px-4 py-3">
          <Icon name="task_alt" className="text-[20px] text-status-accepted" />
          <div className="text-sm">
            <p className="font-semibold text-status-accepted">
              Phase 1 was finalized on {formatFinalizedAt(finalizedAtISO)}
            </p>
            <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">
              Applicant statuses are committed and may already have been emailed.
              Recalculating or re-finalizing now asks for an extra confirmation.
            </p>
          </div>
        </div>
      )}

      {/* Summary */}
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        <span className="font-semibold text-foreground">{counts.complete}</span>{" "}
        applicant{counts.complete === 1 ? "" : "s"} fully scored,{" "}
        <span className="font-semibold text-foreground">{counts.incomplete}</span>{" "}
        still incomplete (excluded from ranking).
      </p>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon="how_to_reg"
          label="Accepting"
          value={targetLabel}
          tone={onTarget ? "accepted" : "primary"}
        />
        <StatCard
          icon="forum"
          label="To Discuss"
          value={String(counts.toDiscuss)}
          tone="pending"
        />
        <StatCard
          icon="do_not_disturb_on"
          label="Rejecting"
          value={String(counts.rejected)}
          tone="rejected"
        />
        <StatCard
          icon="pending"
          label="Not Fully Scored"
          value={String(counts.incomplete)}
          tone="neutral"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-status-rejected/10 px-4 py-2 text-sm text-status-rejected">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-primary/10 px-4 py-2 text-sm text-primary">
          {notice}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => (finalized ? setDialog("recalc-confirm") : doRecalculate())}
          >
            <Icon name="refresh" className="text-[18px]" />
            Recalculate Ranking
          </Button>
          {counts.incomplete > 0 && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {counts.incomplete} incomplete applicant
              {counts.incomplete === 1 ? "" : "s"} will be left behind.
            </span>
          )}
        </div>

        {/* Finalize is the consequential one, so it carries the solid
            status-accepted fill while Recalculate stays an outline button. */}
        <div className="flex flex-col items-end gap-1">
          <Button
            size="lg"
            disabled={!canFinalize}
            title={blockedReason ?? "Commit the Phase 1 shortlist"}
            className="bg-status-accepted text-white hover:bg-status-accepted/85"
            onClick={() =>
              setDialog(finalized ? "refinalize-warn" : "finalize-confirm")
            }
          >
            <Icon name="verified" className="text-[18px]" />
            {finalized ? "Re-finalize Phase 1 Selection" : "Finalize Phase 1 Selection"}
          </Button>
          {blockedReason && (
            <span className="text-xs text-[color:var(--status-pending)]">
              {blockedReason}
            </span>
          )}
        </div>
      </div>

      {/* Filters + sort */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")}>
            All ({rows.length})
          </FilterChip>
          <FilterChip active={filter === "ACCEPT"} onClick={() => setFilter("ACCEPT")}>
            Accept ({counts.accepted})
          </FilterChip>
          <FilterChip
            active={filter === "TO_DISCUSS"}
            onClick={() => setFilter("TO_DISCUSS")}
          >
            To Discuss ({counts.toDiscuss})
          </FilterChip>
          <FilterChip active={filter === "REJECT"} onClick={() => setFilter("REJECT")}>
            Reject ({counts.rejected})
          </FilterChip>
          <FilterChip active={filter === "PENDING"} onClick={() => setFilter("PENDING")}>
            Pending ({counts.pending})
          </FilterChip>
        </div>
        <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-foreground dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="rank">Rank</option>
            <option value="total">Weighted total</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      {/* Ranked table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left dark:border-neutral-800 dark:bg-neutral-800/40">
                <th className="w-16 px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                  Rank
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                  Applicant
                </th>
                <th className="w-32 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                  Weighted total
                </th>
                <th className="w-40 px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                  Classification
                </th>
                <th className="w-48 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                  Resolution
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const isRejected = REJECTED.includes(row.classification);
                const isToDiscuss =
                  row.classification === PhaseOneClassification.TO_DISCUSS;
                return (
                  <tr
                    key={row.applicantId}
                    className={`border-b border-neutral-100 last:border-0 dark:border-neutral-800/60 ${
                      isRejected ? "bg-status-rejected/[0.03] opacity-70" : ""
                    } ${isToDiscuss ? "bg-status-pending/[0.06]" : ""}`}
                  >
                    <td className="px-4 py-3 font-semibold text-neutral-500">
                      {row.rank === null ? "—" : `#${row.rank}`}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">
                        {row.fullName}
                      </span>
                      {!row.complete && (
                        <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                          NOT FULLY SCORED
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">
                      {formatTotal(row.weightedTotal)}
                    </td>
                    <td className="px-4 py-3">
                      <ClassificationBadge value={row.classification} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isToDiscuss ? (
                        <span className="inline-flex gap-2">
                          <Button
                            size="sm"
                            disabled={pending}
                            className="bg-status-accepted text-white hover:bg-status-accepted/85"
                            onClick={() => resolve(row.applicantId, "ACCEPT")}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={pending}
                            onClick={() => resolve(row.applicantId, "REJECT")}
                          >
                            Reject
                          </Button>
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-sm text-neutral-500 dark:text-neutral-400"
                  >
                    No applicants match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Extra gate: recalculating an already-finalized phase */}
      <ConfirmDialog
        open={dialog === "recalc-confirm"}
        onOpenChange={closeIf("recalc-confirm")}
        title="Recalculate an already-finalized phase?"
        description={
          <>
            Phase 1 was finalized on{" "}
            <strong>{finalizedAtISO ? formatFinalizedAt(finalizedAtISO) : ""}</strong>.
            Recalculating can move applicants between accept and reject after
            they may already have been told their outcome. Auto classifications
            will be recomputed; manual resolutions are kept.
          </>
        }
        confirmLabel="Recalculate anyway"
        destructive
        onConfirm={doRecalculate}
      />

      {/* Extra gate: re-finalizing */}
      <ConfirmDialog
        open={dialog === "refinalize-warn"}
        onOpenChange={closeIf("refinalize-warn")}
        title="Re-finalize Phase 1?"
        description={
          <>
            Phase 1 was already finalized on{" "}
            <strong>{finalizedAtISO ? formatFinalizedAt(finalizedAtISO) : ""}</strong>.
            Applicants may already have been emailed their outcome. Re-finalizing
            will overwrite their statuses again.
          </>
        }
        confirmLabel="I understand — continue"
        destructive
        onConfirm={() => setDialog("finalize-confirm")}
      />

      {/* The commit itself */}
      <ConfirmDialog
        open={dialog === "finalize-confirm"}
        onOpenChange={closeIf("finalize-confirm")}
        title="Finalize Phase 1 selection?"
        description={
          <>
            This will shortlist <strong>{counts.accepted}</strong> applicant
            {counts.accepted === 1 ? "" : "s"} and reject{" "}
            <strong>{counts.rejected}</strong>.
            {counts.incomplete > 0 && (
              <>
                {" "}
                <strong>{counts.incomplete}</strong> applicant
                {counts.incomplete === 1 ? "" : "s"} are not fully scored and will
                be left at their current status.
              </>
            )}{" "}
            This cannot be easily undone. Continue?
          </>
        }
        confirmLabel="Finalize selection"
        onConfirm={doFinalize}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  tone: "accepted" | "rejected" | "pending" | "primary" | "neutral";
}) {
  const tones = {
    accepted: "bg-status-accepted/10 text-status-accepted",
    rejected: "bg-status-rejected/10 text-status-rejected",
    pending: "bg-status-pending/15 text-[color:var(--status-pending)]",
    primary: "bg-primary/10 text-primary",
    neutral:
      "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300",
  } as const;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}
      >
        <Icon name={icon} className="text-[20px]" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
          {label}
        </p>
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
          : "rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
      }
    >
      {children}
    </button>
  );
}

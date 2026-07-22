"use client";

import { useMemo, useState, useTransition } from "react";

import { ApplicantStatus, Committee } from "@/generated/prisma/enums";
import { CAPACITY_COMMITTEES } from "@/lib/committee-capacity";
import {
  capacityLevel,
  compareByFormScore,
  decisionStateOf,
  formatScore,
  interviewAverage,
  UNDECIDED_STATUSES,
  type CommitteeUsage,
  type DecisionRow,
  type DecisionState,
  type FinalDecision,
} from "@/lib/final-decision";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app-shell/icon";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CapacityBar } from "./CapacityBar";
import { FinalEmailPanel } from "./FinalEmailPanel";
import { ShortlistPool } from "./ShortlistPool";
import {
  assignCommitteeAction,
  completeFinalDecisionsAction,
  recordDecisionAction,
} from "./actions";

type Tab = "PASS" | "POOL";
type Filter = "TODO" | "ACCEPTED" | "REJECTED" | "ALL";

// A decision that needs the "already completed" gate cleared first, or the
// completion confirmation itself.
type Dialog =
  | { kind: "reopen"; row: DecisionRow; decision: FinalDecision }
  | { kind: "complete" }
  | null;

const STATE_STYLE: Record<
  DecisionState,
  { label: string; dot: string; text: string }
> = {
  UNDECIDED: {
    label: "Not decided",
    dot: "bg-neutral-300 dark:bg-neutral-600",
    text: "text-neutral-500 dark:text-neutral-400",
  },
  ACCEPTED: {
    label: "Accepted",
    dot: "bg-status-accepted",
    text: "text-status-accepted",
  },
  REJECTED: {
    label: "Rejected",
    dot: "bg-status-rejected",
    text: "text-status-rejected",
  },
  SHORTLISTED: {
    label: "Shortlisted",
    dot: "bg-status-pending",
    text: "text-status-pending",
  },
};

function formatCompletedAt(iso: string | null): string {
  if (!iso) return "";
  const [date, rest] = new Date(iso).toISOString().split("T");
  return `${date} at ${(rest ?? "").slice(0, 5)} UTC`;
}

export function FinalDecisionClient({
  campaignId,
  initialRows,
  usage,
  completedAtISO,
  email,
}: {
  campaignId: string;
  initialRows: DecisionRow[];
  usage: CommitteeUsage[];
  completedAtISO: string | null;
  email: {
    canSend: boolean;
    alreadySent: number;
    missingLinkLabels: string[];
  };
}) {
  // Rows come straight from the server on every render: each action calls
  // revalidatePath, so the RSC payload is the single source of truth. Mirroring
  // them into state would risk a stale capacity count mid-meeting.
  const rows = initialRows;

  const [tab, setTab] = useState<Tab>("PASS");
  const [filter, setFilter] = useState<Filter>("TODO");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Committee>>({});
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const completed = completedAtISO !== null;

  // ConfirmDialog fires onConfirm() then onOpenChange(false); only ever close
  // the dialog that's actually still showing, so a chained open isn't wiped.
  const closeIf = (kind: "reopen" | "complete") => (open: boolean) => {
    if (!open) setDialog((prev) => (prev?.kind === kind ? null : prev));
  };

  // Live seat usage. Targets come from the server; the accepted counts are
  // recomputed here from the same rows the list renders, so the bar and the
  // list can never disagree — every ACCEPTED applicant in this campaign is in
  // `rows` by construction.
  const liveUsage: CommitteeUsage[] = useMemo(() => {
    const accepted = new Map<Committee, number>(
      CAPACITY_COMMITTEES.map((c) => [c, 0]),
    );
    for (const row of rows) {
      if (row.status === ApplicantStatus.ACCEPTED && row.assignedCommittee) {
        accepted.set(
          row.assignedCommittee,
          (accepted.get(row.assignedCommittee) ?? 0) + 1,
        );
      }
    }
    return usage.map((u) => ({
      ...u,
      accepted: accepted.get(u.committee) ?? 0,
    }));
  }, [rows, usage]);

  const buckets = useMemo(() => {
    const undecided = rows
      .filter((r) => UNDECIDED_STATUSES.includes(r.status))
      .sort(compareByFormScore);
    return {
      undecided,
      accepted: rows
        .filter((r) => r.status === ApplicantStatus.ACCEPTED)
        .sort(compareByFormScore),
      rejected: rows
        .filter((r) => r.status === ApplicantStatus.REJECTED_FINAL)
        .sort(compareByFormScore),
      pool: rows.filter((r) => r.status === ApplicantStatus.PENDING),
      all: [...rows].sort(compareByFormScore),
    };
  }, [rows]);

  const visible =
    filter === "TODO"
      ? buckets.undecided
      : filter === "ACCEPTED"
        ? buckets.accepted
        : filter === "REJECTED"
          ? buckets.rejected
          : buckets.all;

  // Selection falls back to the top of whatever list is showing, so the panel is
  // never empty while there's anyone to look at.
  const selected =
    rows.find((r) => r.id === selectedId) ?? visible[0] ?? rows[0] ?? null;

  const committeeFor = (row: DecisionRow): Committee =>
    drafts[row.id] ?? row.assignedCommittee ?? row.preferredCommittee;

  const selectedCommittee = selected ? committeeFor(selected) : null;
  const selectedUsage = selectedCommittee
    ? liveUsage.find((u) => u.committee === selectedCommittee)
    : undefined;
  const selectedLevel = selectedUsage
    ? capacityLevel(selectedUsage.accepted, selectedUsage.target)
    : "under";

  const remaining = buckets.undecided.length;

  function setCommittee(applicantId: string, committee: Committee) {
    setDrafts((d) => ({ ...d, [applicantId]: committee }));
    setError(null);
    // For someone already accepted, the dropdown is not a draft — it moves them
    // between committees now, which the capacity bar must reflect immediately.
    const row = rows.find((r) => r.id === applicantId);
    if (row?.status === ApplicantStatus.ACCEPTED) {
      startTransition(async () => {
        const res = await assignCommitteeAction(
          campaignId,
          applicantId,
          committee,
        );
        if (!res.ok) setError(res.error);
      });
    }
  }

  function doDecide(row: DecisionRow, decision: FinalDecision) {
    setError(null);
    setNotice(null);

    // Queue up who to look at next before the row leaves the current filter, so
    // the meeting keeps moving down the list without a manual click.
    const list = visible;
    const index = list.findIndex((r) => r.id === row.id);
    const next = index >= 0 ? (list[index + 1] ?? list[index - 1]) : undefined;

    startTransition(async () => {
      const res = await recordDecisionAction(
        campaignId,
        row.id,
        decision,
        decision === "ACCEPT" ? committeeFor(row) : null,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (filter === "TODO" && next) setSelectedId(next.id);
    });
  }

  // Once the campaign is signed off, any further change asks first.
  function decide(row: DecisionRow, decision: FinalDecision) {
    if (completed) {
      setDialog({ kind: "reopen", row, decision });
      return;
    }
    doDecide(row, decision);
  }

  function complete() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await completeFinalDecisionsAction(campaignId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(
        `Final decisions marked complete — ${res.totalAccepted} accepted, ${res.totalRejected} rejected.`,
      );
    });
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Final Decision
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {remaining === 0
              ? "Everyone has been decided."
              : `${remaining} applicant${remaining === 1 ? "" : "s"} still to decide.`}
          </p>
        </div>
        <Button
          size="lg"
          disabled={pending || remaining > 0}
          onClick={() => setDialog({ kind: "complete" })}
        >
          <Icon name="task_alt" className="text-[18px]" />
          Mark Final Decisions Complete
        </Button>
      </div>

      {completed && (
        <div className="flex items-start gap-3 rounded-xl border border-status-accepted/30 bg-status-accepted/10 px-4 py-3">
          <Icon name="task_alt" className="text-[20px] text-status-accepted" />
          <div className="text-sm">
            <p className="font-semibold text-status-accepted">
              Final decisions completed on {formatCompletedAt(completedAtISO)}
            </p>
            <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">
              Every applicant has an outcome. Changing a decision now asks for
              an extra confirmation.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-status-rejected/30 bg-status-rejected/10 px-4 py-3 text-sm font-medium text-status-rejected">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="rounded-xl border border-status-accepted/30 bg-status-accepted/10 px-4 py-3 text-sm font-medium text-status-accepted">
          {notice}
        </div>
      )}

      {/* STEP 3 — always visible, above both tabs */}
      <CapacityBar usage={liveUsage} />

      {/* Sending only makes sense once every outcome is final. */}
      {completed && (
        <FinalEmailPanel
          campaignId={campaignId}
          canSend={email.canSend}
          acceptedCount={buckets.accepted.length}
          rejectedCount={buckets.rejected.length}
          alreadySent={email.alreadySent}
          missingLinkLabels={email.missingLinkLabels}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        <TabButton active={tab === "PASS"} onClick={() => setTab("PASS")}>
          Decision Pass ({buckets.undecided.length})
        </TabButton>
        <TabButton active={tab === "POOL"} onClick={() => setTab("POOL")}>
          Shortlist Pool ({buckets.pool.length})
        </TabButton>
      </div>

      {tab === "POOL" ? (
        <ShortlistPool
          rows={buckets.pool}
          committeeFor={committeeFor}
          onCommitteeChange={setCommittee}
          onDecide={decide}
          pending={pending}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* List navigation */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                active={filter === "TODO"}
                onClick={() => setFilter("TODO")}
              >
                To decide ({buckets.undecided.length})
              </FilterChip>
              <FilterChip
                active={filter === "ACCEPTED"}
                onClick={() => setFilter("ACCEPTED")}
              >
                Accepted ({buckets.accepted.length})
              </FilterChip>
              <FilterChip
                active={filter === "REJECTED"}
                onClick={() => setFilter("REJECTED")}
              >
                Rejected ({buckets.rejected.length})
              </FilterChip>
              <FilterChip
                active={filter === "ALL"}
                onClick={() => setFilter("ALL")}
              >
                All ({buckets.all.length})
              </FilterChip>
            </div>

            <div className="space-y-2">
              {visible.length === 0 && (
                <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                  Nobody here.
                </p>
              )}
              {visible.map((row) => {
                const state = decisionStateOf(row.status);
                const style = STATE_STYLE[state];
                const isSelected = selected?.id === row.id;
                const avg = interviewAverage(row);
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* STEP 7 — current decision state, at a glance */}
                      <span
                        className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${style.text}`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${style.dot}`}
                        />
                        {style.label}
                      </span>
                      <span className="text-xs font-medium tabular-nums text-neutral-400">
                        {formatScore(row.formScore, 2)}
                      </span>
                    </div>
                    <p className="mt-1 text-base font-semibold text-foreground">
                      {row.fullName}
                    </p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      {row.assignedCommittee ?? row.preferredCommittee}
                      {" · "}
                      {avg === null ? "No interview" : `${formatScore(avg)} avg`}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main panel */}
          {selected ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div>
                    <h2 className="text-4xl font-bold tracking-tight text-foreground">
                      {selected.fullName}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-base text-neutral-500 dark:text-neutral-400">
                      <span className="flex items-center gap-1.5">
                        <Icon name="school" className="text-[18px]" />
                        {selected.yearOfStudy ?? "Year not given"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Icon name="favorite" className="text-[18px]" />
                        Prefers {selected.preferredCommittee}
                      </span>
                      <span
                        className={`flex items-center gap-1.5 font-semibold ${
                          STATE_STYLE[decisionStateOf(selected.status)].text
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            STATE_STYLE[decisionStateOf(selected.status)].dot
                          }`}
                        />
                        {STATE_STYLE[decisionStateOf(selected.status)].label}
                      </span>
                    </div>
                  </div>

                  {/* Assigned committee — independent of the decision itself */}
                  <div className="min-w-[200px]">
                    <label
                      htmlFor="assigned-committee"
                      className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-neutral-500"
                    >
                      Assigned Committee
                    </label>
                    <select
                      id="assigned-committee"
                      value={committeeFor(selected)}
                      disabled={pending}
                      onChange={(e) =>
                        setCommittee(selected.id, e.target.value as Committee)
                      }
                      className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-lg font-semibold text-foreground dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      {CAPACITY_COMMITTEES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    {selectedLevel !== "under" && selectedUsage && (
                      <p
                        className={`mt-1.5 flex items-start gap-1 text-sm font-semibold ${
                          selectedLevel === "over"
                            ? "text-status-rejected"
                            : "text-status-pending"
                        }`}
                      >
                        <Icon name="warning" className="text-[16px]" />
                        {selectedUsage.committee}{" "}
                        {selectedLevel === "over"
                          ? "is over capacity"
                          : "is at capacity"}{" "}
                        ({selectedUsage.accepted}/{selectedUsage.target})
                      </p>
                    )}
                  </div>
                </div>

                {/* Scores */}
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <ScoreTile
                    label="Form Score"
                    value={formatScore(selected.formScore, 2)}
                    hint="Phase 1 weighted total"
                  />
                  <ScoreTile
                    label="Interview Score"
                    value={
                      interviewAverage(selected) === null
                        ? null
                        : formatScore(interviewAverage(selected))
                    }
                    hint="Average of the 7 panel ratings"
                    emptyLabel="Not yet interviewed"
                  />
                </div>
              </div>

              {/* STEP 6 — three large decision buttons */}
              <div className="grid gap-3 sm:grid-cols-3">
                <DecisionButton
                  tone="accept"
                  icon="check_circle"
                  label="Accept"
                  disabled={pending}
                  onClick={() => decide(selected, "ACCEPT")}
                />
                <DecisionButton
                  tone="shortlist"
                  icon="bookmark"
                  label="Shortlist"
                  disabled={pending}
                  onClick={() => decide(selected, "SHORTLIST")}
                />
                <DecisionButton
                  tone="reject"
                  icon="cancel"
                  label="Reject"
                  disabled={pending}
                  onClick={() => decide(selected, "REJECT")}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
              <p className="text-base font-medium text-foreground">
                No applicants to decide.
              </p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Nobody in this campaign is shortlisted or waitlisted.
              </p>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={dialog?.kind === "complete"}
        onOpenChange={closeIf("complete")}
        title="Mark final decisions complete?"
        description={
          <>
            This records that the decision meeting is finished: {" "}
            <strong>{buckets.accepted.length} accepted</strong>,{" "}
            <strong>{buckets.rejected.length} rejected</strong>. You can still
            change a decision afterwards, with an extra confirmation.
          </>
        }
        confirmLabel="Mark complete"
        onConfirm={complete}
      />

      <ConfirmDialog
        open={dialog?.kind === "reopen"}
        onOpenChange={closeIf("reopen")}
        destructive
        title="Change a completed decision?"
        description={
          dialog?.kind === "reopen" ? (
            <>
              Final decisions were completed on{" "}
              {formatCompletedAt(completedAtISO)}. This changes{" "}
              <strong>{dialog.row.fullName}</strong> to{" "}
              <strong>{dialog.decision.toLowerCase()}</strong>.
            </>
          ) : null
        }
        confirmLabel="Change it"
        onConfirm={() => {
          if (dialog?.kind === "reopen") doDecide(dialog.row, dialog.decision);
        }}
      />
    </div>
  );
}

function TabButton({
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
      className={`-mb-px border-b-2 px-4 py-2.5 text-base font-semibold transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-neutral-500 hover:text-foreground dark:text-neutral-400"
      }`}
    >
      {children}
    </button>
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
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
      }`}
    >
      {children}
    </button>
  );
}

function ScoreTile({
  label,
  value,
  hint,
  emptyLabel,
}: {
  label: string;
  value: string | null;
  hint: string;
  emptyLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-950/40">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
        {label}
      </p>
      {value === null ? (
        <p className="mt-1 text-2xl font-semibold text-neutral-400">
          {emptyLabel ?? "—"}
        </p>
      ) : (
        <p className="mt-1 text-4xl font-bold tabular-nums text-foreground">
          {value}
        </p>
      )}
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        {hint}
      </p>
    </div>
  );
}

// Deliberately not the shared <Button>: these are the screen-shared targets of
// the whole meeting and are sized well past any variant in the button scale.
//
// The label flips to near-black in dark mode: the dark-theme status tokens are
// light tints (#4ade80 / #f87171), so white-on-them is the one low-contrast
// combination on a page whose whole job is to be readable over a video call.
const DECISION_TONE = {
  accept:
    "bg-status-accepted text-white dark:text-neutral-950 hover:bg-status-accepted/85",
  shortlist: "bg-primary text-primary-foreground hover:bg-primary/85",
  reject:
    "bg-status-rejected text-white dark:text-neutral-950 hover:bg-status-rejected/85",
} as const;

function DecisionButton({
  tone,
  icon,
  label,
  disabled,
  onClick,
}: {
  tone: keyof typeof DECISION_TONE;
  icon: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl px-6 py-5 text-xl font-bold uppercase tracking-wide transition-colors disabled:opacity-50 ${DECISION_TONE[tone]}`}
    >
      <Icon name={icon} className="text-[24px]" />
      {label}
    </button>
  );
}

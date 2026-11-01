"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";

import { ApplicantStatus, Committee } from "@/generated/prisma/enums";
import { CAPACITY_COMMITTEES } from "@/lib/committee-capacity";
import { NOTE_FIELDS } from "@/lib/interview-note";
import { seatKindLabel } from "@/lib/panel-seat-kind";
import {
  capacityLevel,
  compareByInterview,
  DECISION_PHRASE,
  decisionStateOf,
  formatScore,
  interviewAverage,
  UNDECIDED_STATUSES,
  type CommitteeUsage,
  type DecisionRow,
  type DecisionState,
  type FinalDecision,
  type SortDirection,
} from "@/lib/final-decision";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/app-shell/icon";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { studyLineOf } from "@/lib/applicant-form-fields";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";
import { CapacityBar } from "./CapacityBar";
import { InterviewReviewsButton } from "./InterviewReviewsButton";
import { Phase2Entries } from "./Phase2Entries";
import {
  assignCommitteeAction,
  completeFinalDecisionsAction,
  recordDecisionAction,
} from "./actions";

type Filter = "TODO" | "SHORTLISTED" | "ACCEPTED" | "REJECTED" | "ALL";

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
    text: "text-status-accepted-text",
  },
  REJECTED: {
    label: "Rejected",
    dot: "bg-status-rejected",
    text: "text-status-rejected-text",
  },
  SHORTLISTED: {
    label: "Shortlisted",
    dot: "bg-status-pending",
    text: "text-status-pending-text",
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
  emailPanel,
}: {
  campaignId: string;
  initialRows: DecisionRow[];
  usage: CommitteeUsage[];
  completedAtISO: string | null;
  /**
   * The SEND_EMAILS-gated "Final Result Emails" section, already built and
   * wrapped in <PermissionGate> by the page — a Server Component, which is
   * why this arrives as a ready-made node rather than being constructed here.
   * Null whenever the campaign isn't completed yet or the viewer lacks the
   * permission; either way, there is nothing more for this component to do
   * beyond rendering it in place.
   */
  emailPanel: React.ReactNode;
}) {
  // Rows come straight from the server on every render: each action calls
  // revalidatePath, so the RSC payload is the single source of truth. Mirroring
  // them into state would risk a stale capacity count mid-meeting.
  const rows = initialRows;

  const [filter, setFilter] = useState<Filter>("TODO");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Committee>>({});
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // What the last successful decision did, shown next to the buttons with a way
  // back. Lives here (not in the panel) because the panel remounts for the next
  // applicant the moment a decision advances the queue.
  const [lastDecision, setLastDecision] = useState<{
    id: string;
    text: string;
    undoable: boolean;
  } | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!lastDecision) return;
    const timer = setTimeout(() => setLastDecision(null), 10_000);
    return () => clearTimeout(timer);
  }, [lastDecision]);

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
    const compare = compareByInterview(sortDir);
    const undecided = rows
      .filter((r) => UNDECIDED_STATUSES.includes(r.status))
      .sort(compare);
    return {
      undecided,
      accepted: rows
        .filter((r) => r.status === ApplicantStatus.ACCEPTED)
        .sort(compare),
      rejected: rows
        .filter((r) => r.status === ApplicantStatus.REJECTED_FINAL)
        .sort(compare),
      pool: rows
        .filter((r) => r.status === ApplicantStatus.PENDING)
        .sort(compare),
      all: [...rows].sort(compare),
    };
  }, [rows, sortDir]);

  const visible =
    filter === "TODO"
      ? buckets.undecided
      : filter === "SHORTLISTED"
        ? buckets.pool
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

  // The badge/subtitle count, deliberately narrower than `remaining`: only
  // applicants whose status is "Not decided" (gray dot). The shortlisted pool
  // (`PENDING` / yellow dot) is still open work — it stays in `remaining`,
  // which gates the "Mark Complete" button — but it is not "not decided".
  const notDecided = rows.filter(
    (r) => decisionStateOf(r.status) === "UNDECIDED",
  ).length;

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

    const committee = decision === "ACCEPT" ? committeeFor(row) : null;

    startTransition(async () => {
      const res = await recordDecisionAction(
        campaignId,
        row.id,
        decision,
        committee,
      );
      if (!res.ok) {
        setError(res.error);
        setLastDecision(null);
        return;
      }
      setLastDecision({
        id: row.id,
        text: decisionSummary(row.fullName, decision, committee),
        undoable: decision !== "UNDECIDE",
      });
      // Undoing a decision keeps the same person on screen — they're the one
      // being corrected, so jumping to the next name would lose them.
      if (filter === "TODO" && next && decision !== "UNDECIDE") {
        setSelectedId(next.id);
      }
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

  // Goes through decide(), so a completed campaign still asks first.
  function undoLast() {
    const row = lastDecision && rows.find((r) => r.id === lastDecision.id);
    if (row) decide(row, "UNDECIDE");
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
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">
              Final Decision
            </h1>
            <RemainingBadge
              notDecided={notDecided}
              shortlistedLeft={remaining > 0}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <InterviewReviewsButton campaignId={campaignId} />
          <Button
            size="lg"
            disabled={pending || remaining > 0}
            onClick={() => setDialog({ kind: "complete" })}
          >
            <Icon name="task_alt" className="text-[18px]" />
            Mark Final Decisions Complete
          </Button>
        </div>
      </div>

      {completed && (
        <div className="flex items-start gap-3 rounded-xl border border-status-accepted/30 bg-status-accepted/10 px-4 py-3">
          <Icon name="task_alt" className="text-[20px] text-status-accepted-text" />
          <div className="text-sm">
            <p className="font-semibold text-status-accepted-text">
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
        <div
          role="alert"
          className="rounded-xl border border-status-rejected/30 bg-status-rejected/10 px-4 py-3 text-sm font-medium text-status-rejected-text"
        >
          {error}
        </div>
      )}
      {notice && !error && (
        <div
          role="status"
          className="rounded-xl border border-status-accepted/30 bg-status-accepted/10 px-4 py-3 text-sm font-medium text-status-accepted-text"
        >
          {notice}
        </div>
      )}

      {/* STEP 3 — always visible, above both tabs */}
      <CapacityBar usage={liveUsage} />

      {/* Sending only makes sense once every outcome is final — the page
          already only builds emailPanel once `completed`, so this just
          renders whatever it was handed. */}
      {emailPanel}

      {/* The five list filters, as tabs. Scrolls horizontally rather than
          wrapping on narrow screens: a second row of tabs would push the whole
          decision panel down. */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800">
        <div role="group" aria-label="Filter applicants" className="flex gap-1">
          <TabButton
            active={filter === "TODO"}
            onClick={() => setFilter("TODO")}
          >
            To decide ({buckets.undecided.length})
          </TabButton>
          <TabButton
            active={filter === "SHORTLISTED"}
            onClick={() => setFilter("SHORTLISTED")}
          >
            Shortlisted ({buckets.pool.length})
          </TabButton>
          <TabButton
            active={filter === "ACCEPTED"}
            onClick={() => setFilter("ACCEPTED")}
          >
            Accepted ({buckets.accepted.length})
          </TabButton>
          <TabButton
            active={filter === "REJECTED"}
            onClick={() => setFilter("REJECTED")}
          >
            Rejected ({buckets.rejected.length})
          </TabButton>
          <TabButton active={filter === "ALL"} onClick={() => setFilter("ALL")}>
            All ({buckets.all.length})
          </TabButton>
        </div>
        {/* Un-interviewed applicants stay at the bottom either way — see
            compareByInterview. */}
        <SortToggle
          direction={sortDir}
          onToggle={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* List navigation. Sticks below the fixed 64px header and scrolls
            inside itself, so picking someone far down the list never leaves
            the panel — or the list — out of view. */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start">
          <div className="space-y-2 lg:-m-1 lg:min-h-0 lg:overflow-y-auto lg:p-1">
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
                  aria-current={isSelected ? "true" : undefined}
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
                    {avg !== null && (
                      <span className="text-xs font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
                        {formatScore(avg)} avg
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-base font-semibold text-foreground">
                    {row.fullName}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {row.assignedCommittee ?? row.preferredCommittee}
                    {studyLineOf(row) && ` · ${studyLineOf(row)}`}
                    {avg === null && " · No interview"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main panel.
            Crossfade only, keyed on the applicant, at the `fast` token — the
            panel swaps wholesale when a decision advances the queue, and with
            no signal at all that swap reads as a glitch on a shared screen.
            Opacity and nothing else: no travel, no layout animation, so the
            next name is legible ~0.15s after the button is pressed. */}
        {selected ? (
          <motion.div
            // `reduced` is part of the key for the same reason it is on
            // StatBar: the hook reads false in the hydration snapshot, so
            // without a remount the mount-time fade starts anyway and the
            // zero-length transition arrives too late to stop it.
            key={`${selected.id}:${reduced}`}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: DURATION.fast, ease: EASE.out }
            }
            className="space-y-4"
          >
            <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-0">
                  <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    {selected.fullName}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-base text-neutral-500 dark:text-neutral-400">
                    <span className="flex items-center gap-1.5">
                      <Icon name="school" className="text-[18px]" />
                      {studyLineOf(selected) ?? "Year not given"}
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
                          ? "text-status-rejected-text"
                          : "text-status-pending-text"
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

              {/* Score */}
              <div className="mt-6">
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

              {/* Drill-in: jury, all 7 ratings, remarks, closed status.
                  Expanded by default — the meeting reads the notes for every
                  applicant, so it shouldn't take a click each time. Keyed by
                  applicant so switching resets it to expanded. */}
              <FullInterviewNotes key={selected.id} row={selected} />

              <Phase2Entries row={selected} />
            </div>

            {/* STEP 6 — three large decision buttons */}
            {/* Decision buttons stay in place under the panel — deliberately
                not sticky, so they scroll with the content. */}
            <div className="space-y-2">
              {lastDecision && (
                <div
                  role="status"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800"
                >
                  <span className="font-medium text-foreground">
                    {lastDecision.text}
                  </span>
                  {lastDecision.undoable && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={undoLast}
                      className="inline-flex cursor-pointer items-center gap-1 font-semibold text-primary-text underline-offset-2 hover:underline disabled:opacity-50 dark:text-primary"
                    >
                      <Icon name="undo" className="text-[14px]" />
                      Move back to undecided
                    </button>
                  )}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {/* The button for the applicant's CURRENT outcome turns into its
                    undo; the other two stay, so switching straight to a
                    different outcome is still one click. */}
                {selected.status === ApplicantStatus.ACCEPTED ? (
                  <DecisionButton
                    tone="undo"
                    icon="undo"
                    label="Remove accepted"
                    disabled={pending}
                    onClick={() => decide(selected, "UNDECIDE")}
                  />
                ) : (
                  <DecisionButton
                    tone="accept"
                    icon="check_circle"
                    label="Accept"
                    disabled={pending}
                    onClick={() => decide(selected, "ACCEPT")}
                  />
                )}
                {selected.status === ApplicantStatus.PENDING ? (
                  <DecisionButton
                    tone="undo"
                    icon="undo"
                    label="Remove from shortlisted"
                    disabled={pending}
                    onClick={() => decide(selected, "UNDECIDE")}
                  />
                ) : (
                  <DecisionButton
                    tone="shortlist"
                    icon="bookmark"
                    label="Shortlist"
                    disabled={pending}
                    onClick={() => decide(selected, "SHORTLIST")}
                  />
                )}
                {selected.status === ApplicantStatus.REJECTED_FINAL ? (
                  <DecisionButton
                    tone="undo"
                    icon="undo"
                    label="Unreject"
                    disabled={pending}
                    onClick={() => decide(selected, "UNDECIDE")}
                  />
                ) : (
                  <DecisionButton
                    tone="reject"
                    icon="cancel"
                    label="Reject"
                    disabled={pending}
                    onClick={() => decide(selected, "REJECT")}
                  />
                )}
              </div>
            </div>
          </motion.div>
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
              <strong>{DECISION_PHRASE[dialog.decision]}</strong>.
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

/** What a decision did, in one sentence, for the confirmation line. */
function decisionSummary(
  name: string,
  decision: FinalDecision,
  committee: Committee | null,
): string {
  switch (decision) {
    case "ACCEPT":
      return `${name} accepted${committee ? ` to ${committee}` : ""}`;
    case "REJECT":
      return `${name} rejected`;
    case "SHORTLIST":
      return `${name} shortlisted`;
    case "UNDECIDE":
      return `${name} moved back to undecided`;
  }
}

function SortToggle({
  direction,
  onToggle,
}: {
  direction: SortDirection;
  onToggle: () => void;
}) {
  const label = `Interview score: ${direction === "desc" ? "best first" : "lowest first"}`;
  return (
    <button
      type="button"
      onClick={onToggle}
      // Starts with the visible text so voice control ("click interview
      // score") matches the accessible name.
      aria-label={`${label}. Activate to reverse.`}
      className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap px-3 py-2 text-xs font-semibold text-neutral-500 transition-colors hover:text-foreground motion-reduce:transition-none dark:text-neutral-400"
    >
      <Icon
        name={direction === "desc" ? "arrow_downward" : "arrow_upward"}
        className="text-[14px]"
      />
      {label}
    </button>
  );
}

/**
 * STEP 0 — how many applicants are still "Not decided" (gray dot), at a
 * glance. Shortlisted-pool applicants are NOT counted here — they are still
 * open work for the meeting (gated by `remaining`), but not undecided.
 * Derived from the same rows the list renders — never stored, so it can't
 * drift. Amber while any remain; green check at zero.
 */
function RemainingBadge({
  notDecided,
  shortlistedLeft,
}: {
  notDecided: number;
  /** True when any shortlisted-pool applicants remain open. */
  shortlistedLeft: boolean;
}) {
  return notDecided === 0 ? (
    <span
      role="status"
      className="inline-flex items-center gap-2 rounded-full border border-status-accepted/40 bg-status-accepted/10 px-4 py-2 text-lg font-semibold text-status-accepted-text"
    >
      <Icon name="task_alt" className="text-[22px]" />
      {shortlistedLeft ? "No not-decided left" : "All decided"}
    </span>
  ) : (
    <span
      role="status"
      className="inline-flex items-center gap-2 rounded-full border border-status-pending/40 bg-status-pending/10 px-4 py-2 text-status-pending-text"
    >
      <span className="text-2xl font-bold leading-none tabular-nums">
        {notDecided}
      </span>
      <span className="text-sm font-semibold uppercase tracking-wide">
        left
      </span>
    </span>
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
      aria-pressed={active}
      onClick={onClick}
      className={`-mb-px shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-4 py-2.5 text-base font-semibold transition-colors motion-reduce:transition-none ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-neutral-500 hover:text-foreground dark:text-neutral-400"
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
        <p className="mt-1 text-2xl font-semibold text-neutral-500 dark:text-neutral-400">
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

/**
 * Collapsible drill-in below the lean AVG summary. The Final Decision page is
 * MANAGE_ACCOUNTS/ENTER_FINAL_DECISION-gated, so Part B's closed-note lockout
 * does NOT apply here — the full jury, every rating, remarks and the note's
 * open/closed status are always shown. Expanded by default (remounted per
 * applicant via a key on the caller); the header still collapses it.
 */
function FullInterviewNotes({ row }: { row: DecisionRow }) {
  const [open, setOpen] = useState(true);
  const reduced = useReducedMotion();

  return (
    <div className="mt-6 rounded-xl border border-neutral-200 dark:border-neutral-800">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon name="description" className="text-[18px] text-neutral-500 dark:text-neutral-400" />
          View Full Interview Notes
        </span>
        {/* The chevron rotates rather than swapping glyphs — one element that
            turns reads as the same control changing state. */}
        <motion.span
          className="inline-flex"
          animate={{ rotate: open ? 180 : 0 }}
          initial={false}
          transition={
            reduced
              ? { duration: 0 }
              : { duration: DURATION.fast, ease: EASE.out }
          }
        >
          <Icon name="expand_more" className="text-[20px] text-neutral-500 dark:text-neutral-400" />
        </motion.span>
      </button>

      {/* Opens at the `fast` token — this is the one thing on the page someone
          waits on mid-discussion ("can you open the notes?"), so it must be
          essentially instantaneous while still showing that the panel grew out
          of the header rather than appearing from nowhere. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="notes-body"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 1 } : { height: 0, opacity: 0 }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: DURATION.fast, ease: EASE.out }
            }
            className="overflow-hidden"
          >
        <div className="space-y-5 border-t border-neutral-200 px-4 py-4 dark:border-neutral-800">
          {/* Jury — this panel's seats, "Open" for any still unfilled. Columns
              track the panel's own size, so a 4-seat panel doesn't wrap one
              lonely seat onto a second row. */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
              Jury
            </p>
            <ul
              className={`grid gap-2 ${
                row.jury.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"
              }`}
            >
              {row.jury.map((j) => (
                <li
                  key={j.kind}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
                >
                  <span className="inline-flex min-w-10 justify-center rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                    {seatKindLabel(j.kind)}
                  </span>
                  {j.name ? (
                    <span className="truncate text-sm text-foreground">
                      {j.name}
                    </span>
                  ) : (
                    <span className="text-sm italic text-neutral-500 dark:text-neutral-400">Open</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Every one of the 7 ratings individually, not just the average */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
              Panel Ratings
            </p>
            {row.noteScores === null ? (
              <p className="text-sm italic text-neutral-500 dark:text-neutral-400">
                No interview note recorded yet.
              </p>
            ) : (
              <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {NOTE_FIELDS.map((f) => {
                  const v = row.noteScores?.[f.key];
                  return (
                    <li
                      key={f.key}
                      className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-1.5 dark:border-neutral-800/60"
                    >
                      <span className="text-sm text-neutral-600 dark:text-neutral-300">
                        {f.label}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {typeof v === "number" ? v.toFixed(2) : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Remarks */}
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
              Remarks
            </p>
            {row.remarks ? (
              <p className="whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-300">
                {row.remarks}
              </p>
            ) : (
              <p className="text-sm italic text-neutral-500 dark:text-neutral-400">No remarks.</p>
            )}
          </div>

          {/* Open / closed status */}
          <p className="flex items-center gap-1.5 text-xs">
            <Icon
              name={row.noteClosed ? "lock" : "lock_open"}
              className={`text-[14px] ${
                row.noteClosed ? "text-status-rejected-text" : "text-status-accepted-text"
              }`}
            />
            {row.noteClosed ? (
              <span className="text-neutral-600 dark:text-neutral-300">
                Note closed{row.closedByName ? ` by ${row.closedByName}` : ""}.
              </span>
            ) : (
              <span className="text-neutral-600 dark:text-neutral-300">
                Note open.
              </span>
            )}
          </p>
        </div>
          </motion.div>
        )}
      </AnimatePresence>
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
    "bg-status-accepted-text text-white dark:text-neutral-950 hover:bg-status-accepted-text/90",
  // Same status-pending token as the "Shortlisted" dot in the list. Dark label:
  // white on this amber is 1.7:1.
  shortlist: "bg-status-pending text-neutral-950 hover:bg-status-pending/85",
  reject:
    "bg-status-rejected-text text-white dark:text-neutral-950 hover:bg-status-rejected-text/90",
  // Neutral on purpose: undoing is not a verdict, so it borrows no status colour.
  undo: "bg-neutral-200 text-foreground hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600",
} as const;

/**
 * A decision button, with a press confirmation that lasts 0.15s and nothing
 * more.
 *
 * The whole room is looking at this button when it is pressed, and the outcome
 * it triggers moves the list, the capacity bar and the panel at once — so the
 * button's own feedback has to land and be gone before any of that. It is a
 * single quick scale dip back to rest, keyed on a click counter so a second
 * press of the same button replays it. No colour flash, no ripple, nothing that
 * outlives the click.
 */
function DecisionButton({
  tone,
  icon,
  label,
  disabled,
  onClick,
}: {
  tone: keyof typeof DECISION_TONE;
  icon: IconName;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const reduced = useReducedMotion();
  const [pulsing, setPulsing] = useState(false);

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!reduced) setPulsing(true);
        onClick();
      }}
      animate={pulsing ? { scale: [1, 0.96, 1] } : { scale: 1 }}
      // Cleared the moment it finishes, so the next press starts from rest and
      // replays instead of finding the target already satisfied.
      onAnimationComplete={() => setPulsing(false)}
      transition={
        reduced ? { duration: 0 } : { duration: DURATION.fast, ease: EASE.out }
      }
      className={`flex items-center justify-center gap-2 rounded-xl px-6 py-5 text-xl font-bold uppercase tracking-wide transition-colors disabled:opacity-50 motion-reduce:transition-none ${DECISION_TONE[tone]}`}
    >
      <Icon name={icon} className="text-[24px]" />
      {label}
    </motion.button>
  );
}

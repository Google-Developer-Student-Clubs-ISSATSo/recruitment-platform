import { Icon } from "@/components/app-shell/icon";
import type { PhaseOneOutcomeCounts } from "@/lib/campaign-statistics";
import { StatBar } from "./StatBar";

// How Phase 1 was decided, for the applicants who were actually scored.
//
// Four horizontal bars rather than a chart component: the interesting reading
// is a 2×2 (accept/reject × automatic/human-resolved), and plain bars let the
// human-resolved rows carry an explicit tag instead of a colour the reader has
// to decode.
//
// Colour here is STATUS, not series identity — green means accepted and red
// means rejected, exactly as they do on every status badge in the app — so it
// always travels with a written label. Automatic vs human-resolved is carried
// by the tag, never by hue.

type Row = {
  key: keyof PhaseOneOutcomeCounts;
  label: string;
  hint: string;
  humanResolved: boolean;
  tone: "accepted" | "rejected";
};

const ROWS: Row[] = [
  {
    key: "autoAccept",
    label: "Auto-accepted",
    hint: "Cleared the accept threshold outright.",
    humanResolved: false,
    tone: "accepted",
  },
  {
    key: "manualAccept",
    label: "Manually accepted",
    hint: "Flagged to discuss, then resolved to accept.",
    humanResolved: true,
    tone: "accepted",
  },
  {
    key: "autoReject",
    label: "Auto-rejected",
    hint: "Fell below the reject threshold outright.",
    humanResolved: false,
    tone: "rejected",
  },
  {
    key: "manualReject",
    label: "Manually rejected",
    hint: "Flagged to discuss, then resolved to reject.",
    humanResolved: true,
    tone: "rejected",
  },
];

const TONE = {
  accepted: { fill: "bg-status-accepted", text: "text-status-accepted" },
  rejected: { fill: "bg-status-rejected", text: "text-status-rejected" },
} as const;

export function Phase1OutcomeBreakdown({
  counts,
}: {
  counts: PhaseOneOutcomeCounts;
}) {
  const resolved =
    counts.autoAccept +
    counts.manualAccept +
    counts.autoReject +
    counts.manualReject;
  const humanResolved = counts.manualAccept + counts.manualReject;
  // Bars are scaled against the largest row so each reads as a share of the
  // biggest bucket; a zero-width track still shows for an empty outcome.
  const widest = Math.max(...ROWS.map((r) => counts[r.key]), 1);

  return (
    <section className="h-full rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-lg font-semibold text-foreground">
        Phase 1 Outcomes
      </h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        How each scored applicant was decided.{" "}
        <span className="font-medium text-foreground">
          {humanResolved} of {resolved}
        </span>{" "}
        needed a human call — the two rows tagged below.
      </p>

      <div className="mt-6 space-y-5">
        {ROWS.map((row, index) => {
          const count = counts[row.key];
          const tone = TONE[row.tone];
          return (
            <div
              key={row.key}
              role="group"
              aria-label={`${row.label}: ${count}. ${row.hint}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {row.label}
                  {row.humanResolved && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      <Icon name="person" className="text-[12px]" />
                      Human-resolved
                    </span>
                  )}
                </span>
                <span className="text-lg font-bold tabular-nums text-foreground">
                  {count}
                </span>
              </div>

              <div className="mt-1.5">
                <StatBar
                  percent={(count / widest) * 100}
                  fillClassName={tone.fill}
                  index={index}
                />
              </div>

              <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                {row.hint}
              </p>
            </div>
          );
        })}
      </div>

      {counts.unresolved > 0 && (
        <p className="mt-5 flex items-start gap-1.5 rounded-lg bg-status-pending/10 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-300">
          <Icon
            name="pending"
            className="text-[16px] text-[color:var(--status-pending)]"
          />
          <span>
            <span className="font-semibold text-foreground">
              {counts.unresolved}
            </span>
            {counts.unresolved === 1
              ? " scored applicant is still unresolved"
              : " scored applicants are still unresolved"}
            {" (pending or awaiting a to-discuss call), which is why the four "}
            {"rows above don't add up to the scored pool."}
          </span>
        </p>
      )}
    </section>
  );
}

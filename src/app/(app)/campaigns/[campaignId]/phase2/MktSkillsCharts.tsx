"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { COMMITTEE_LABEL, committeeLabel } from "@/lib/committee";
import { DURATION_MS, useReducedMotion } from "@/lib/motion-tokens";
import type { SkillCount } from "@/lib/phase2";
import type { MktSkillApplicant } from "@/lib/phase2-store";
import type { Committee } from "@/generated/prisma/enums";

// The two charts above the MKT skills tables. Both encode one thing in colour —
// whether a skill came from the form's options or the "Other:" box — and use
// the same two tokens for it, so the legend reads once for the pair:
//   --primary        a whitelisted option
//   --chart-writein  an "Other:" write-in
// Validated as a categorical pair in both modes (see globals.css). Text never
// wears either colour; it stays in foreground/muted ink.
//
// The applicant table below names everyone behind these counts; the exact
// per-skill figures live in the bar tooltips (and recharts' accessibilityLayer
// makes the bars keyboard-reachable), since the totals table was dropped as a
// repeat of the first chart.

const LISTED_FILL = "var(--primary)";
const WRITE_IN_FILL = "var(--chart-writein)";

// Long write-ins ("Photoshop and a bit of Premiere Pro") would push the bars
// off a phone-width card; the tooltip carries the full text.
const MAX_LABEL = 22;
const truncate = (s: string) =>
  s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}…` : s;

function TooltipCard({
  title,
  lines,
}: {
  title: string;
  lines: string[];
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {lines.map((line) => (
        <p key={line} className="text-sm text-neutral-500 dark:text-neutral-400">
          {line}
        </p>
      ))}
    </div>
  );
}

const plural = (n: number) => `${n} applicant${n === 1 ? "" : "s"}`;

/**
 * A count axis that ends at (a whole step past) the data, with integer ticks.
 * recharts' default "nice" scale ran both axes to 4 for a maximum of 2, so the
 * bars filled half the plot. Steps of 1 up to 6, then about five ticks.
 */
function countAxis(max: number): { domain: [number, number]; ticks: number[] } {
  const top = Math.max(1, max);
  const step = top <= 6 ? 1 : Math.ceil(top / 5);
  const end = Math.ceil(top / step) * step;
  const ticks = Array.from({ length: end / step + 1 }, (_, i) => i * step);
  return { domain: [0, end], ticks };
}

/**
 * The colour key. Only rendered when both kinds are on screen — with one kind
 * there is one series, and the chart titles already name it.
 */
function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-300">
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2.5 rounded-sm"
          style={{ background: LISTED_FILL }}
        />
        Form option
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2.5 rounded-sm"
          style={{ background: WRITE_IN_FILL }}
        />
        Written in under &ldquo;Other&rdquo;
      </li>
    </ul>
  );
}

/** Applicants per skill — a ranking, so horizontal bars, longest first. */
function SkillsChart({ skills }: { skills: SkillCount[] }) {
  const reduced = useReducedMotion();
  // Comfortable row pitch for a 12px label; grows with the list rather than
  // squeezing bars, since write-ins can add many rows.
  const height = Math.max(160, skills.length * 32 + 32);
  const axis = countAxis(Math.max(0, ...skills.map((s) => s.count)));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer
          layout="vertical"
          data={skills}
          margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
          barCategoryGap={6}
        >
          {/* Solid hairlines one shade off the surface — never dashed. */}
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            domain={axis.domain}
            ticks={axis.ticks}
            allowDecimals={false}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="skill"
            width={150}
            tickLine={false}
            axisLine={false}
            tickFormatter={truncate}
            tick={{ fill: "var(--foreground)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as SkillCount | undefined;
              if (!active || !row) return null;
              return (
                <TooltipCard
                  title={row.skill}
                  lines={[
                    plural(row.count),
                    row.writeIn ? "Written in under “Other”" : "Form option",
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="count"
            // 4px rounded data-end; the baseline end stays square.
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
            isAnimationActive={!reduced}
            animationBegin={0}
            animationDuration={DURATION_MS.slow}
            animationEasing="ease-out"
          >
            {skills.map((s) => (
              <Cell
                key={`${s.writeIn ? "w" : "l"}:${s.skill}`}
                fill={s.writeIn ? WRITE_IN_FILL : LISTED_FILL}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type CommitteeRow = {
  committee: Committee;
  /** Applicants with at least one whitelisted skill. */
  listed: number;
  /** Applicants whose only skills are write-ins. */
  writeInOnly: number;
  total: number;
};

/**
 * Where the skilled applicants sit, by preferred committee — the answer to "do
 * we have MKT-capable people outside MKT?". Each applicant is counted once:
 * under "form option" if they ticked any whitelisted skill, otherwise under
 * write-in, so the two segments add up to the people in the table below.
 */
function CommitteeChart({ applicants }: { applicants: MktSkillApplicant[] }) {
  const reduced = useReducedMotion();
  const rows: CommitteeRow[] = (
    Object.keys(COMMITTEE_LABEL) as Committee[]
  ).map((committee) => {
    const mine = applicants.filter((a) => a.preferredCommittee === committee);
    const listed = mine.filter((a) => a.skills.length > 0).length;
    return {
      committee,
      listed,
      writeInOnly: mine.length - listed,
      total: mine.length,
    };
  });
  const axis = countAxis(Math.max(0, ...rows.map((r) => r.total)));
  // Each stack's total rides on its axis label ("MKT · 2") rather than on a
  // LabelList: a label hung off the top segment vanished whenever that segment
  // was zero-height — which, with no write-ins, was every stack.
  const totalOf = new Map(rows.map((r) => [r.committee, r.total]));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer
          data={rows}
          margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
          barCategoryGap="30%"
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="committee"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(c: Committee) => `${c} · ${totalOf.get(c) ?? 0}`}
            tick={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }}
          />
          <YAxis
            domain={axis.domain}
            ticks={axis.ticks}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={48}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as CommitteeRow | undefined;
              if (!active || !row) return null;
              return (
                <TooltipCard
                  title={committeeLabel(row.committee)}
                  lines={[
                    `${plural(row.listed)} with a form option`,
                    `${plural(row.writeInOnly)} with write-ins only`,
                  ]}
                />
              );
            }}
          />
          {/* Stacked, with a 2px card-coloured stroke as the surface gap
              between the two segments. */}
          <Bar
            dataKey="listed"
            stackId="skills"
            fill={LISTED_FILL}
            stroke="var(--card)"
            strokeWidth={2}
            maxBarSize={72}
            isAnimationActive={!reduced}
            animationBegin={0}
            animationDuration={DURATION_MS.slow}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="writeInOnly"
            stackId="skills"
            fill={WRITE_IN_FILL}
            stroke="var(--card)"
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
            maxBarSize={72}
            isAnimationActive={!reduced}
            animationBegin={0}
            animationDuration={DURATION_MS.slow}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MktSkillsCharts({
  skills,
  applicants,
}: {
  skills: SkillCount[];
  applicants: MktSkillApplicant[];
}) {
  const showLegend =
    skills.some((s) => s.writeIn) && skills.some((s) => !s.writeIn);

  return (
    <div className="space-y-4 border-b border-neutral-200 px-4 py-5 sm:px-6 dark:border-neutral-800">
      {showLegend && <Legend />}
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <figure className="min-w-0">
          <figcaption className="mb-3 text-sm font-semibold text-foreground">
            Applicants per skill
          </figcaption>
          <SkillsChart skills={skills} />
        </figure>
        <figure className="min-w-0">
          <figcaption className="mb-3 text-sm font-semibold text-foreground">
            Applicants with an MKT skill, by preferred committee
          </figcaption>
          <CommitteeChart applicants={applicants} />
        </figure>
      </div>
    </div>
  );
}

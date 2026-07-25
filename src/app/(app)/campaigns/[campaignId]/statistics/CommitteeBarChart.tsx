"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { committeeLabel } from "@/lib/committee";
import type { CommitteeCount } from "@/lib/campaign-statistics";
import { DURATION_MS, useReducedMotion } from "@/lib/motion-tokens";

// Applicant counts per committee. Used twice on the Statistics page — once for
// the committee people ASKED for, once for the committee they were accepted
// into — so the two read identically and only their titles and captions differ.
//
// Colour: this is ONE series (a count) across three nominal categories, so
// every bar takes the same hue. Colouring MKT/TM/EER differently would spend
// the identity channel re-encoding what the bar lengths already say, and
// shading them by size would be a value-ramp on categories that have no order.
// The hue is the brand --primary token, not a literal.

type ChartRow = { committee: string; label: string; count: number };

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
      <p className="text-sm font-semibold text-foreground">{row.label}</p>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {row.count} applicant{row.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function CommitteeBarChart({
  data,
  title,
  caption,
  emptyMessage = "No applicants yet.",
}: {
  data: CommitteeCount[];
  title: string;
  /** The one-line note under the title — e.g. why these totals differ. */
  caption: string;
  emptyMessage?: string;
}) {
  const reduced = useReducedMotion();
  const rows: ChartRow[] = data.map((d) => ({
    committee: d.committee,
    label: committeeLabel(d.committee),
    count: d.count,
  }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        {caption}
      </p>

      {total === 0 ? (
        <p className="mt-8 mb-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {emptyMessage}
        </p>
      ) : (
        // Height covers the plot AND the x-axis band, so the axis labels are
        // never clipped into a nested scrollbar.
        <div className="mt-6 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer
              data={rows}
              margin={{ top: 16, right: 8, bottom: 0, left: -20 }}
              barCategoryGap="30%"
            >
              {/* Solid hairlines one shade off the surface — never dashed. */}
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <XAxis
                dataKey="committee"
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={48}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              />
              <Bar
                dataKey="count"
                fill="var(--primary)"
                // 4px rounded data-end, anchored square on the baseline.
                radius={[4, 4, 0, 0]}
                maxBarSize={72}
                // Grown from the baseline on load, using recharts' own
                // animation rather than a motion wrapper — the bar geometry is
                // recharts', and animating the SVG from outside would fight it.
                // Capped at the shared 0.3s ceiling, and switched off entirely
                // under prefers-reduced-motion, where the bars render at full
                // height immediately.
                isAnimationActive={!reduced}
                animationBegin={0}
                animationDuration={DURATION_MS.slow}
                animationEasing="ease-out"
              >
                {/* Three bars only, so every one can carry its value without
                    becoming the "a number on every point" mess. */}
                <LabelList
                  dataKey="count"
                  position="top"
                  offset={8}
                  fill="var(--foreground)"
                  fontSize={13}
                  fontWeight={600}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-2 text-sm font-medium text-neutral-500 dark:text-neutral-400">
        Total: <span className="tabular-nums text-foreground">{total}</span>
      </p>
    </section>
  );
}

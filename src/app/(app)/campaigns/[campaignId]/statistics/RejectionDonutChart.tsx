"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { DURATION_MS, useReducedMotion } from "@/lib/motion-tokens";

// Where the campaign's rejections happened. Part-to-whole at a glance, three
// segments — inside the ≤ 6 a donut can carry honestly.
//
// Colour is ORDINAL, not categorical: the three reasons are exit points in
// pipeline order (never eligible → screened out → turned down at the end), so
// they take one hue in monotone lightness steps, and the reader sees the
// sequence in the colour. Three unrelated hues would imply the reasons are
// unordered peers. The steps are the --chart-reject-* tokens in globals.css,
// re-stepped there for the dark surface.
//
// The palest step sits below 3:1 on its surface, which is expected for the
// light end of an ordinal ramp — every segment is therefore direct-labelled in
// the legend below with its exact count and share, so identity and magnitude
// never depend on the fill alone.

export type RejectionSlice = {
  key: string;
  label: string;
  /** What this exit point means, for the tooltip. */
  hint: string;
  count: number;
  /** CSS custom property holding this step of the ramp. */
  color: string;
};

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: { payload: RejectionSlice }[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;
  const share = total === 0 ? 0 : Math.round((slice.count / total) * 100);
  return (
    <div className="max-w-56 rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
      <p className="text-sm font-semibold text-foreground">{slice.label}</p>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {slice.count} rejected · {share}%
      </p>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {slice.hint}
      </p>
    </div>
  );
}

export function RejectionDonutChart({ slices }: { slices: RejectionSlice[] }) {
  const reduced = useReducedMotion();
  const total = slices.reduce((sum, s) => sum + s.count, 0);

  return (
    <section className="flex flex-col rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-lg font-semibold text-foreground">
        Rejection Reasons
      </h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Every rejected applicant, by the stage they exited at.
      </p>

      {total === 0 ? (
        <p className="my-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Nobody has been rejected yet.
        </p>
      ) : (
        <>
          <div className="relative mx-auto mt-6 h-52 w-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="count"
                  nameKey="label"
                  innerRadius="62%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  // A 2px surface gap between segments instead of a stroke
                  // drawn around each one.
                  paddingAngle={2}
                  stroke="none"
                  // Segments sweep in from 12 o'clock in pipeline order, which
                  // is the same order the ramp's lightness steps encode — the
                  // entrance re-states the reading rather than decorating it.
                  // recharts' own animation, capped at the 0.3s ceiling and off
                  // entirely under prefers-reduced-motion.
                  isAnimationActive={!reduced}
                  animationBegin={0}
                  animationDuration={DURATION_MS.slow}
                  animationEasing="ease-out"
                >
                  {slices.map((slice) => (
                    <Cell key={slice.key} fill={`var(${slice.color})`} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip total={total} />} />
              </PieChart>
            </ResponsiveContainer>

            {/* The hole carries the headline the ring is a breakdown of. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-foreground">{total}</span>
              <span className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Rejected
              </span>
            </div>
          </div>

          {/* Legend doubles as the table view: exact counts, never colour alone. */}
          <ul className="mt-6 space-y-3">
            {slices.map((slice) => (
              <li
                key={slice.key}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: `var(${slice.color})` }}
                  />
                  <span className="truncate text-sm text-foreground">
                    {slice.label}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {slice.count}
                  <span className="ml-2 font-normal text-neutral-500 dark:text-neutral-400">
                    {Math.round((slice.count / total) * 100)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

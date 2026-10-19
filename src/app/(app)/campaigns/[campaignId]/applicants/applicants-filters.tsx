"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/app-shell/icon";
import { Input } from "@/components/ui/input";
import { ApplicantStatus, Committee } from "@/generated/prisma/enums";

export type ApplicantFilters = {
  q: string;
  /** Raw ApplicantStatus value, or "" for all. */
  status: string;
  /** Raw Committee value, or "" for all. */
  committee: string;
  /** "YYYY-MM-DD" Tunis day the applicant submitted on, or "" for all. */
  day: string;
};

/**
 * One day the form received submissions on, for the "Submitted on" dropdown.
 * Ascending by `value`, so the options read first-submission-day first — the
 * same direction the list itself is ordered.
 */
export type SubmittedDayOption = {
  value: string;
  label: string;
  count: number;
};

const ALL = "";

/**
 * Search + status + committee, all held in the URL so the server query does the
 * filtering. Filtering in the browser is not an option here: the table is a
 * 10-row server-side slice, so a client filter would only ever search the page
 * you are looking at.
 *
 * Every change drops `page`, resetting to 1 — narrowing to three results while
 * still on page 4 would show an empty table and read as a broken filter.
 *
 * The selects navigate immediately. The search box cannot: a router push per
 * keystroke would be a server round-trip per character, so it keeps its own
 * local state for responsiveness and pushes on a short debounce.
 */
export function ApplicantsFilters({
  basePath,
  filters,
  presentStatuses,
  submittedDays,
}: {
  basePath: string;
  filters: ApplicantFilters;
  presentStatuses: ApplicantStatus[];
  submittedDays: SubmittedDayOption[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);

  // The committed value currently reflected in the URL. Comparing against it is
  // what stops the debounce from firing a redundant push on mount, or re-pushing
  // a value the URL already has.
  const committed = useRef(filters.q);

  function hrefFor(next: ApplicantFilters) {
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.status) params.set("status", next.status);
    if (next.committee) params.set("committee", next.committee);
    if (next.day) params.set("day", next.day);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  useEffect(() => {
    if (q === committed.current) return;
    const t = setTimeout(() => {
      committed.current = q;
      router.push(hrefFor({ ...filters, q }));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function applySelect(patch: Partial<ApplicantFilters>) {
    // Carry the box's current text rather than the last committed value, so a
    // half-typed search isn't discarded by touching a dropdown.
    committed.current = q;
    router.push(hrefFor({ ...filters, q, ...patch }));
  }

  const anyActive = Boolean(q || filters.status || filters.committee || filters.day);

  return (
    // At 375px the search box takes the full first line and the three selects
    // wrap across the second, rather than the search claiming a 220px minimum
    // and shoving one select onto a line of its own.
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="relative w-full sm:min-w-[220px] sm:flex-1">
        <Icon
          name="search"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-neutral-400"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
          className="pl-9"
        />
      </div>

      <FilterSelect
        value={filters.status}
        onChange={(v) => applySelect({ status: v })}
        ariaLabel="Filter by status"
      >
        <option value={ALL}>All statuses</option>
        {presentStatuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        value={filters.committee}
        onChange={(v) => applySelect({ committee: v })}
        ariaLabel="Filter by committee"
      >
        <option value={ALL}>All committees</option>
        {Object.values(Committee).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        value={filters.day}
        onChange={(v) => applySelect({ day: v })}
        ariaLabel="Filter by submission day"
      >
        <option value={ALL}>All days</option>
        {submittedDays.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label} ({d.count})
          </option>
        ))}
      </FilterSelect>

      {anyActive && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            committed.current = "";
            router.push(basePath);
          }}
          className="text-[11px] font-semibold uppercase tracking-wider text-primary transition-colors hover:text-primary/80"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  ariaLabel,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // flex-1 below sm so the selects share each row evenly instead of
      // sizing to their longest option and wrapping.
      className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-none dark:bg-input/30"
    >
      {children}
    </select>
  );
}

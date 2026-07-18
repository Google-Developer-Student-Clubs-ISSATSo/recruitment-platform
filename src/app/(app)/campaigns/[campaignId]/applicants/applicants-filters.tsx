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
 * The two selects navigate immediately. The search box cannot: a router push per
 * keystroke would be a server round-trip per character, so it keeps its own
 * local state for responsiveness and pushes on a short debounce.
 */
export function ApplicantsFilters({
  basePath,
  filters,
  presentStatuses,
}: {
  basePath: string;
  filters: ApplicantFilters;
  presentStatuses: ApplicantStatus[];
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

  const anyActive = Boolean(q || filters.status || filters.committee);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="relative min-w-[220px] flex-1">
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
      className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
    >
      {children}
    </select>
  );
}

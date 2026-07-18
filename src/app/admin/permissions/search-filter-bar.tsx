"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Committee } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/input";
import type { TemplateOption } from "./permission-config";

export type MemberFilters = {
  q: string;
  /** Raw Committee value, or "" for all. */
  committee: string;
  /** Raw RoleTemplateName value, or "" for all. */
  template: string;
};

const SELECT_CLASS =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950";

/**
 * Search + committee + role-template filters, held in the URL so the server
 * query does the filtering. The member table is a paginated slice, so filtering
 * it in the browser would only ever filter the current page — and "select all
 * matching" needs a set the server can also see.
 *
 * Every change drops `page`, resetting to 1: narrowing to three results while
 * still on page 4 would show an empty table and read as a broken filter.
 *
 * The selects navigate immediately; the search box keeps local state and pushes
 * on a short debounce, so typing isn't a server round-trip per character.
 */
export function SearchFilterBar({
  basePath,
  filters,
  committees,
  templates,
}: {
  basePath: string;
  filters: MemberFilters;
  committees: Committee[];
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);

  // What the URL currently holds — comparing against it stops the debounce
  // firing a redundant push on mount or re-pushing an unchanged value.
  const committed = useRef(filters.q);

  function hrefFor(next: MemberFilters) {
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.committee) params.set("committee", next.committee);
    if (next.template) params.set("template", next.template);
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

  function applySelect(patch: Partial<MemberFilters>) {
    // Carry the box's current text, so a half-typed search isn't thrown away by
    // touching a dropdown.
    committed.current = q;
    router.push(hrefFor({ ...filters, q, ...patch }));
  }

  const anyActive = Boolean(q || filters.committee || filters.template);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-56 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
          aria-hidden
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search members by name or email"
          className="h-10 pl-9"
        />
      </div>

      <select
        aria-label="Filter by committee"
        value={filters.committee}
        onChange={(e) => applySelect({ committee: e.target.value })}
        className={SELECT_CLASS}
      >
        <option value="">All committees</option>
        {committees.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by role template"
        value={filters.template}
        onChange={(e) => applySelect({ template: e.target.value })}
        className={SELECT_CLASS}
      >
        <option value="">All role templates</option>
        {templates.map((t) => (
          <option key={t.name} value={t.name}>
            {t.label}
          </option>
        ))}
      </select>

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

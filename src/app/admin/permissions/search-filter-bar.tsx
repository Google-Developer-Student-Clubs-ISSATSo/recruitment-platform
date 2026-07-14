"use client";

import { Search } from "lucide-react";

import { Committee, RoleTemplateName } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/input";
import type { TemplateOption } from "./permission-config";

export type MemberFilters = {
  query: string;
  committee: Committee | "ALL";
  template: RoleTemplateName | "ALL";
};

export const EMPTY_FILTERS: MemberFilters = {
  query: "",
  committee: "ALL",
  template: "ALL",
};

const SELECT_CLASS =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950";

/**
 * Reusable live search + filter controls for the member list. Purely
 * controlled: it renders the inputs and reports changes; the parent owns the
 * filter state and applies it. Text search combines with the committee and
 * role-template dropdowns.
 */
export function SearchFilterBar({
  filters,
  onChange,
  committees,
  templates,
}: {
  filters: MemberFilters;
  onChange: (next: MemberFilters) => void;
  committees: Committee[];
  templates: TemplateOption[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-56 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
          aria-hidden
        />
        <Input
          type="search"
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          placeholder="Search by name or email…"
          aria-label="Search members by name or email"
          className="h-10 pl-9"
        />
      </div>

      <select
        aria-label="Filter by committee"
        value={filters.committee}
        onChange={(e) =>
          onChange({
            ...filters,
            committee: e.target.value as MemberFilters["committee"],
          })
        }
        className={SELECT_CLASS}
      >
        <option value="ALL">All committees</option>
        {committees.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by role template"
        value={filters.template}
        onChange={(e) =>
          onChange({
            ...filters,
            template: e.target.value as MemberFilters["template"],
          })
        }
        className={SELECT_CLASS}
      >
        <option value="ALL">All role templates</option>
        {templates.map((t) => (
          <option key={t.name} value={t.name}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Whether a row matches the active filters. Shared by the parent list. */
export function matchesFilters(
  row: { name: string; email: string; committee: Committee; templateName: RoleTemplateName },
  filters: MemberFilters,
): boolean {
  const q = filters.query.trim().toLowerCase();
  if (q && !row.name.toLowerCase().includes(q) && !row.email.toLowerCase().includes(q))
    return false;
  if (filters.committee !== "ALL" && row.committee !== filters.committee)
    return false;
  if (filters.template !== "ALL" && row.templateName !== filters.template)
    return false;
  return true;
}

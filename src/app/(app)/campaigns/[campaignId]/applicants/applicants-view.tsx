"use client";

import { useMemo, useState } from "react";

import { ApplicantStatus, Committee } from "@/generated/prisma/enums";
import { Icon } from "@/components/app-shell/icon";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "./status-badge";
import { ImportPanel } from "./import/import-panel";

export type ApplicantRow = {
  id: string;
  fullName: string;
  email: string;
  preferredCommittee: Committee;
  isIssatsoStudent: boolean;
  status: ApplicantStatus;
};

const ALL = "ALL";

// The applicants list: header + import action, stat cards, a filter bar, and a
// table with token-colored status badges. Data is real and campaign-scoped
// (fetched by the server page); this component only filters what it's given.
export function ApplicantsView({
  campaignId,
  applicants,
  canImport,
}: {
  campaignId: string;
  applicants: ApplicantRow[];
  canImport: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [committee, setCommittee] = useState<string>(ALL);

  // Only offer statuses that actually appear, so the filter never lists empty
  // buckets.
  const presentStatuses = useMemo(
    () => [...new Set(applicants.map((a) => a.status))],
    [applicants],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applicants.filter((a) => {
      if (status !== ALL && a.status !== status) return false;
      if (committee !== ALL && a.preferredCommittee !== committee) return false;
      if (
        q &&
        !a.fullName.toLowerCase().includes(q) &&
        !a.email.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [applicants, query, status, committee]);

  const counts = useMemo(
    () => ({
      total: applicants.length,
      submitted: applicants.filter((a) => a.status === ApplicantStatus.SUBMITTED)
        .length,
      rejected: applicants.filter(
        (a) => a.status === ApplicantStatus.REJECTED_PHASE1,
      ).length,
      issatso: applicants.filter((a) => a.isIssatsoStudent).length,
    }),
    [applicants],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Applicants</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {counts.total} applicant{counts.total === 1 ? "" : "s"} in this
            campaign.
          </p>
        </div>
        {canImport && <ImportPanel campaignId={campaignId} />}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Submitted" value={counts.submitted} tone="primary" />
        <StatCard
          label="Rejected (Phase 1)"
          value={counts.rejected}
          tone="rejected"
        />
        <StatCard label="ISSATSO students" value={counts.issatso} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative min-w-[220px] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-neutral-400"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="pl-9"
          />
        </div>
        <FilterSelect
          value={status}
          onChange={setStatus}
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
          value={committee}
          onChange={setCommittee}
          ariaLabel="Filter by committee"
        >
          <option value={ALL}>All committees</option>
          {Object.values(Committee).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </FilterSelect>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Committee</th>
              <th className="px-5 py-3">ISSATSO</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-10 text-center text-sm italic text-neutral-400"
                >
                  {applicants.length === 0
                    ? "No applicants in this campaign yet."
                    : "No applicants match your filters."}
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr
                  key={a.id}
                  className="transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                >
                  <td className="px-5 py-3 font-medium text-foreground">
                    {a.fullName}
                  </td>
                  <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                    {a.email}
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded px-2 py-0.5 text-[10px] font-bold bg-primary/10 text-primary">
                      {a.preferredCommittee}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-neutral-500 dark:text-neutral-400">
                    {a.isIssatsoStudent ? "Yes" : "No"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="border-t border-neutral-200 bg-neutral-50 px-5 py-3 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
          Showing {filtered.length} of {counts.total} applicant
          {counts.total === 1 ? "" : "s"}
        </div>
      </div>
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

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "primary" | "rejected";
}) {
  const valueColor =
    tone === "primary"
      ? "text-primary"
      : tone === "rejected"
        ? "text-status-rejected"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}

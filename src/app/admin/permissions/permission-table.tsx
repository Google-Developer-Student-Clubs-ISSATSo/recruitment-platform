"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { Committee, PermissionKey } from "@/generated/prisma/enums";
import { Icon } from "@/components/app-shell/icon";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";
import { AnimatedList } from "@/components/motion/table-slice";
import {
  type AdminUserRow,
  type TemplateOption,
} from "./permission-config";
import {
  bulkSetPermission,
  createUser,
  deleteUser,
  resetToTemplate,
  togglePermission,
  type CreateUserState,
} from "./actions";
import { UserRow } from "./user-row";
import { SearchFilterBar, type MemberFilters } from "./search-filter-bar";
import { BulkActionBar } from "./bulk-action-bar";

const createInitial: CreateUserState = { status: "idle" };

export function PermissionTable({
  leads,
  members,
  templates,
  committees,
  currentUserId,
  totalMembers,
  customizedCount,
  matchingCount,
  matchingIds,
  page,
  pageCount,
  pageSize,
  filters,
}: {
  leads: AdminUserRow[];
  /** Just this page's members — already filtered and ordered by the server. */
  members: AdminUserRow[];
  templates: TemplateOption[];
  committees: Committee[];
  /** The signed-in admin — their own row is not deletable from here. */
  currentUserId: string;
  /** Totals over everyone, independent of filters and paging. */
  totalMembers: number;
  customizedCount: number;
  /** How many members match the current filters, across all pages. */
  matchingCount: number;
  /** Their ids — what "select all matching" selects. */
  matchingIds: string[];
  page: number;
  pageCount: number;
  pageSize: number;
  filters: MemberFilters;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [createState, createAction, creating] = useActionState(
    createUser,
    createInitial,
  );
  const reduced = useReducedMotion();

  // Collapse the create panel the moment the action reports success. Adjusting
  // state during render on a changed value (rather than in an effect) is the
  // React-recommended pattern; the panel is conditionally rendered, so it
  // remounts with cleared fields the next time it is opened.
  const [lastCreateStatus, setLastCreateStatus] = useState(createState.status);
  if (createState.status !== lastCreateStatus) {
    setLastCreateStatus(createState.status);
    if (createState.status === "success") setShowCreate(false);
  }

  const basePath = "/admin/permissions";
  const anyFilterActive = Boolean(
    filters.q || filters.committee || filters.template,
  );

  // Page links carry the active filters, or paging would silently clear them.
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.committee) params.set("committee", filters.committee);
    if (filters.template) params.set("template", filters.template);
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const first = matchingCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + members.length;

  // Selection is by id and deliberately survives paging: "select all matching"
  // spans pages, so the bar must keep counting members who aren't on screen.
  const pageIds = members.map((m) => m.id);
  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const allMatchingSelected =
    matchingIds.length > 0 && matchingIds.every((id) => selected.has(id));

  function toggleOne(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function togglePage(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of pageIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function applyBulk(permission: PermissionKey, grant: boolean) {
    setBulkNotice(null);
    const ids = [...selected];
    startTransition(async () => {
      const res = await bulkSetPermission(ids, permission, grant);
      // Cleared on success so the bar collapses and nothing is left armed.
      setSelected(new Set());
      const verb = grant ? "Granted" : "Revoked";
      const preposition = grant ? "to" : "from";
      setBulkNotice(
        `${verb} ${permission} ${preposition} ${res.affectedCount} member` +
          `${res.affectedCount === 1 ? "" : "s"}` +
          (res.unchangedCount > 0
            ? ` (${res.unchangedCount} already ${grant ? "had" : "didn't have"} it)`
            : "") +
          ".",
      );
    });
  }

  function toggle(userId: string, permission: PermissionKey, grant: boolean) {
    startTransition(async () => {
      await togglePermission(userId, permission, grant);
    });
  }

  function reset(userId: string) {
    startTransition(async () => {
      await resetToTemplate(userId);
    });
  }

  function remove(userId: string) {
    startTransition(async () => {
      await deleteUser(userId);
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Permission Management
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Manage role-based access control for the recruitment team. Every
            member belongs to one home committee.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          <Icon name={showCreate ? "close" : "person_add"} className="text-[18px]" />
          {showCreate ? "Close" : "Create User"}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Total Members" value={totalMembers} />
        <StatCard label="Role Templates" value={templates.length} tone="primary" />
        <StatCard label="Customized" value={customizedCount} tone="rejected" />
      </div>

      {/* Create form — an inline expanding panel rather than a true dialog: it
          keeps focus in the normal document flow right below the button that
          opened it, and the actionState wiring below only needs to persist
          across expand/collapse, not across a portal mount. The animation is
          the same one the app already uses for collapsible sections
          (height+opacity via AnimatePresence). */}
      <AnimatePresence initial={false}>
        {showCreate && (
          <motion.div
            key="create-panel"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 1 } : { height: 0, opacity: 0 }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: DURATION.base, ease: EASE.out }
            }
            className="overflow-hidden"
          >
        <form
          action={createAction}
          className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-foreground">
            Create new member
          </h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Adds the account immediately with the chosen role template. They can
            sign in with their email right away.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              name="name"
              placeholder="Full name"
              required
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950"
            />
            <input
              name="email"
              type="email"
              placeholder="email@gdgc.edu"
              required
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950"
            />
            <select
              name="roleTemplate"
              required
              defaultValue=""
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="" disabled>
                Select role template…
              </option>
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              name="committee"
              required
              defaultValue=""
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="" disabled>
                Select committee…
              </option>
              {committees.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create User"}
            </button>
            {createState.status === "error" && (
              <span className="text-sm text-status-rejected">
                {createState.message}
              </span>
            )}
            {createState.status === "success" && (
              <span className="text-sm text-status-accepted">
                {createState.message}
              </span>
            )}
          </div>
        </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search + filter */}
      <SearchFilterBar
        basePath={basePath}
        filters={filters}
        committees={committees}
        templates={templates}
      />

      {bulkNotice && (
        <p className="rounded-lg bg-primary/10 px-4 py-2 text-sm text-primary">
          {bulkNotice}
        </p>
      )}

      {/* TM Lead — distinct section at the top */}
      {leads.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
            Team Lead
          </h3>
          <div className="overflow-hidden rounded-xl border border-l-4 border-neutral-200 border-l-primary bg-white dark:border-neutral-800 dark:border-l-primary dark:bg-neutral-900">
            {leads.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                expanded={expanded === user.id}
                onToggleExpand={() =>
                  setExpanded(expanded === user.id ? null : user.id)
                }
                pending={pending}
                onToggle={(permission, grant) => toggle(user.id, permission, grant)}
                onReset={() => reset(user.id)}
                // The TM Lead's permissions are fixed: no toggles, no reset, no
                // delete. The row shows read-only badges instead.
                readOnly
                canDelete={false}
                onDelete={() => remove(user.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* All other members */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
          Members
        </h3>
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          {/* lg and up only — see the collapse-breakpoint note on UserRow for
              why this one column set needs lg rather than the md the
              Applicants and Activity Log tables use. */}
          <div className="hidden grid-cols-[28px_24px_1fr_190px_110px_170px_110px] items-center gap-4 border-b border-neutral-200 bg-neutral-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 lg:grid dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
            <input
              type="checkbox"
              aria-label="Select all members on this page"
              checked={allOnPageSelected}
              disabled={pending || pageIds.length === 0}
              onChange={(e) => togglePage(e.target.checked)}
              className="size-4 rounded border-neutral-300 text-primary focus:ring-primary/30"
            />
            <span></span>
            <span>Member</span>
            <span>Primary Role</span>
            <span>Committee</span>
            <span>Access Level</span>
            <span className="text-right">Actions</span>
          </div>

          {/* Reaching beyond the current page: the filter bar doubles as the
              "pick a group" mechanism, so this selects the whole filtered set
              rather than introducing a separate group concept. */}
          {anyFilterActive && matchingCount > members.length && (
            <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-primary/5 px-5 py-2 text-sm dark:border-neutral-800">
              {allMatchingSelected ? (
                <>
                  <span className="text-foreground">
                    All {matchingCount} matching members are selected.
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="font-semibold text-primary hover:underline"
                  >
                    Clear selection
                  </button>
                </>
              ) : (
                <>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {allOnPageSelected
                      ? `All ${members.length} on this page selected.`
                      : "Filters are active."}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setSelected(new Set(matchingIds))}
                    className="font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    Select all {matchingCount} members matching current filters
                  </button>
                </>
              )}
            </div>
          )}

          {members.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm italic text-neutral-400">
              No members match your search.
            </div>
          ) : (
            <AnimatedList
              signature={`${page}|${filters.q}|${filters.committee}|${filters.template}`}
            >
            {members.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                expanded={expanded === user.id}
                onToggleExpand={() =>
                  setExpanded(expanded === user.id ? null : user.id)
                }
                pending={pending}
                onToggle={(permission, grant) => toggle(user.id, permission, grant)}
                onReset={() => reset(user.id)}
                canDelete={user.id !== currentUserId}
                onDelete={() => remove(user.id)}
                selected={selected.has(user.id)}
                onSelectedChange={(on) => toggleOne(user.id, on)}
              />
            ))}
            </AnimatedList>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-5 py-3 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
            <span>
              Showing {first}–{last} of {matchingCount}
              {anyFilterActive ? " matching" : ""} member
              {matchingCount === 1 ? "" : "s"}
            </span>
            {pageCount > 1 && (
              <Pagination page={page} pageCount={pageCount} pageHref={pageHref} />
            )}
          </div>
        </div>
      </section>

      <AnimatePresence>
        {selected.size > 0 && (
          <BulkActionBar
            selectedCount={selected.size}
            pending={pending}
            onApply={applyBulk}
            onClear={() => setSelected(new Set())}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** At most this many numbered page links, windowed around the current page. */
const PAGE_WINDOW = 5;

/**
 * Real links to `?page=N`, so paging re-runs the server query with a new
 * skip/take. Prev/Next become inert spans at the ends — a disabled <a> is still
 * followable, so the element type changes, not just its styling.
 */
function Pagination({
  page,
  pageCount,
  pageHref,
}: {
  page: number;
  pageCount: number;
  pageHref: (n: number) => string;
}) {
  const windowStart = Math.max(
    1,
    Math.min(page - Math.floor(PAGE_WINDOW / 2), pageCount - PAGE_WINDOW + 1),
  );
  const windowEnd = Math.min(pageCount, windowStart + PAGE_WINDOW - 1);
  const pages = Array.from(
    { length: windowEnd - windowStart + 1 },
    (_, i) => windowStart + i,
  );

  const arrowClass =
    "flex size-8 items-center justify-center rounded border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800";
  const arrowDisabledClass =
    "flex size-8 items-center justify-center rounded border border-neutral-200 text-neutral-300 opacity-40 dark:border-neutral-800 dark:text-neutral-600";

  return (
    <div className="flex items-center gap-1">
      {page > 1 ? (
        <Link href={pageHref(page - 1)} aria-label="Previous page" className={arrowClass}>
          <Icon name="chevron_left" className="text-[20px]" />
        </Link>
      ) : (
        <span aria-hidden className={arrowDisabledClass}>
          <Icon name="chevron_left" className="text-[20px]" />
        </span>
      )}
      {pages.map((n) =>
        n === page ? (
          <span
            key={n}
            aria-current="page"
            className="flex size-8 items-center justify-center rounded bg-primary text-sm font-semibold text-white"
          >
            {n}
          </span>
        ) : (
          <Link
            key={n}
            href={pageHref(n)}
            aria-label={`Page ${n}`}
            className="flex size-8 items-center justify-center rounded border border-neutral-200 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {n}
          </Link>
        ),
      )}
      {page < pageCount ? (
        <Link href={pageHref(page + 1)} aria-label="Next page" className={arrowClass}>
          <Icon name="chevron_right" className="text-[20px]" />
        </Link>
      ) : (
        <span aria-hidden className={arrowDisabledClass}>
          <Icon name="chevron_right" className="text-[20px]" />
        </span>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "primary" | "rejected" | "pending";
}) {
  const valueColor =
    tone === "primary"
      ? "text-primary"
      : tone === "rejected"
        ? "text-status-rejected"
        : tone === "pending"
          ? "text-[color:var(--status-pending)]"
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

"use client";

import { useActionState, useMemo, useState, useTransition } from "react";

import { Committee, PermissionKey } from "@/generated/prisma/enums";
import { Icon } from "@/components/app-shell/icon";
import {
  type AdminUserRow,
  type TemplateOption,
} from "./permission-config";
import {
  createUser,
  deleteUser,
  resetToTemplate,
  togglePermission,
  type CreateUserState,
} from "./actions";
import { UserRow } from "./user-row";
import {
  EMPTY_FILTERS,
  SearchFilterBar,
  matchesFilters,
  type MemberFilters,
} from "./search-filter-bar";

const createInitial: CreateUserState = { status: "idle" };

export function PermissionTable({
  leads,
  members,
  templates,
  committees,
  currentUserId,
}: {
  leads: AdminUserRow[];
  members: AdminUserRow[];
  templates: TemplateOption[];
  committees: Committee[];
  /** The signed-in admin — their own row is not deletable from here. */
  currentUserId: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filters, setFilters] = useState<MemberFilters>(EMPTY_FILTERS);
  const [pending, startTransition] = useTransition();
  const [createState, createAction, creating] = useActionState(
    createUser,
    createInitial,
  );

  // Collapse the create panel the moment the action reports success. Adjusting
  // state during render on a changed value (rather than in an effect) is the
  // React-recommended pattern; the panel is conditionally rendered, so it
  // remounts with cleared fields the next time it is opened.
  const [lastCreateStatus, setLastCreateStatus] = useState(createState.status);
  if (createState.status !== lastCreateStatus) {
    setLastCreateStatus(createState.status);
    if (createState.status === "success") setShowCreate(false);
  }

  const allUsers = [...leads, ...members];
  const customizedCount = allUsers.filter((u) => u.isCustom).length;

  const visibleLeads = useMemo(
    () => leads.filter((u) => matchesFilters(u, filters)),
    [leads, filters],
  );
  const visibleMembers = useMemo(
    () => members.filter((u) => matchesFilters(u, filters)),
    [members, filters],
  );
  const totalVisible = visibleLeads.length + visibleMembers.length;

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
        <StatCard label="Total Members" value={allUsers.length} />
        <StatCard label="Role Templates" value={templates.length} tone="primary" />
        <StatCard label="Customized" value={customizedCount} tone="rejected" />
      </div>

      {/* Create form */}
      {showCreate && (
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
      )}

      {/* Search + filter */}
      <SearchFilterBar
        filters={filters}
        onChange={setFilters}
        committees={committees}
        templates={templates}
      />

      {/* TM Lead — distinct section at the top */}
      {visibleLeads.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
            Team Lead
          </h3>
          <div className="overflow-hidden rounded-xl border border-l-4 border-neutral-200 border-l-primary bg-white dark:border-neutral-800 dark:border-l-primary dark:bg-neutral-900">
            {visibleLeads.map((user) => (
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
          <div className="hidden grid-cols-[24px_1fr_190px_110px_170px_110px] items-center gap-4 border-b border-neutral-200 bg-neutral-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 sm:grid dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
            <span></span>
            <span>Member</span>
            <span>Primary Role</span>
            <span>Committee</span>
            <span>Access Level</span>
            <span className="text-right">Actions</span>
          </div>
          {visibleMembers.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm italic text-neutral-400">
              No members match your search.
            </div>
          ) : (
            visibleMembers.map((user) => (
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
              />
            ))
          )}
          <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-5 py-3 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
            <span>
              Showing {totalVisible} of {allUsers.length} member
              {allUsers.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </section>
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

"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { Committee, PermissionKey } from "@/generated/prisma/enums";
import {
  COMMITTEES,
  PERMISSION_CATEGORIES,
  ROLE_TEMPLATE_LABELS,
  humanizePermission,
  isCommitteeScoped,
  type AdminUserRow,
  type TemplateOption,
} from "./permission-config";
import {
  createUser,
  resetToTemplate,
  togglePermission,
  type CreateUserState,
} from "./actions";

function permKey(permission: PermissionKey, committee: Committee | null) {
  return `${permission}::${committee ?? "GLOBAL"}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

const createInitial: CreateUserState = { status: "idle" };

export function PermissionTable({
  users,
  templates,
}: {
  users: AdminUserRow[];
  templates: TemplateOption[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [createState, createAction, creating] = useActionState(
    createUser,
    createInitial,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (createState.status === "success") {
      formRef.current?.reset();
      setShowCreate(false);
    }
  }, [createState]);

  const customizedCount = users.filter((u) => !u.isExactTemplate).length;

  function toggle(
    userId: string,
    permission: PermissionKey,
    committee: Committee | null,
    currentlyOn: boolean,
  ) {
    startTransition(async () => {
      await togglePermission(userId, permission, committee, !currentlyOn);
    });
  }

  function reset(user: AdminUserRow) {
    const label = ROLE_TEMPLATE_LABELS[user.closestTemplate];
    if (!window.confirm(`Reset ${user.name} to "${label}" template defaults?`))
      return;
    startTransition(async () => {
      await resetToTemplate(user.id, user.closestTemplate);
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Permission Management
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Manage role-based access control and committee-specific scopes for
            the recruitment team.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          {showCreate ? "Close" : "+ Add Member"}
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total Members" value={users.length} />
        <StatCard label="Role Templates" value={templates.length} />
        <StatCard label="Customized" value={customizedCount} />
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          ref={formRef}
          action={createAction}
          className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-foreground">
            Create new member
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
          </div>
          <div className="mt-3 flex items-center gap-3">
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

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="hidden grid-cols-[1fr_140px_160px_120px] gap-4 border-b border-neutral-200 px-4 py-2.5 text-xs font-semibold tracking-wider text-neutral-500 sm:grid dark:border-neutral-800 dark:text-neutral-400">
          <span>MEMBER</span>
          <span>ROLE</span>
          <span>COMMITTEES</span>
          <span className="text-right">ACTIONS</span>
        </div>

        {users.map((user) => {
          const held = new Set(
            user.permissions.map((p) => permKey(p.permission, p.committee)),
          );
          const isOpen = expanded === user.id;

          return (
            <div
              key={user.id}
              className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60"
            >
              {/* Row */}
              <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[1fr_140px_160px_120px] sm:items-center sm:gap-4">
                <button
                  onClick={() => setExpanded(isOpen ? null : user.id)}
                  className="flex items-center gap-3 text-left"
                >
                  <span
                    className={`text-neutral-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                  >
                    ▸
                  </span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials(user.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {user.name}
                    </span>
                    <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {user.email}
                    </span>
                  </span>
                </button>

                <div>
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      user.isExactTemplate
                        ? "bg-primary/10 text-primary"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                    }`}
                  >
                    {user.badgeLabel}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {user.committees.length > 0 ? (
                    user.committees.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        {c}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-neutral-400">Global</span>
                  )}
                </div>

                <div className="sm:text-right">
                  <button
                    onClick={() => reset(user)}
                    disabled={pending}
                    className="text-xs font-medium text-neutral-500 hover:text-primary disabled:opacity-50 dark:text-neutral-400"
                  >
                    Reset defaults
                  </button>
                </div>
              </div>

              {/* Expanded: permission chips */}
              {isOpen && (
                <div className="space-y-4 border-t border-neutral-100 bg-neutral-50/60 px-4 py-4 dark:border-neutral-800/60 dark:bg-neutral-950/40">
                  {PERMISSION_CATEGORIES.map((cat) => (
                    <div key={cat.title}>
                      <h4 className="mb-2 text-xs font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                        {cat.title.toUpperCase()}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2">
                        {cat.permissions.map((perm) =>
                          isCommitteeScoped(perm) ? (
                            <div
                              key={perm}
                              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-700"
                            >
                              <span className="text-xs text-neutral-600 dark:text-neutral-300">
                                {humanizePermission(perm)}
                              </span>
                              {COMMITTEES.map((c) => {
                                const on = held.has(permKey(perm, c));
                                return (
                                  <Chip
                                    key={c}
                                    label={c}
                                    active={on}
                                    disabled={pending}
                                    onClick={() => toggle(user.id, perm, c, on)}
                                  />
                                );
                              })}
                            </div>
                          ) : (
                            <Chip
                              key={perm}
                              label={humanizePermission(perm)}
                              active={held.has(permKey(perm, null))}
                              disabled={pending}
                              onClick={() =>
                                toggle(
                                  user.id,
                                  perm,
                                  null,
                                  held.has(permKey(perm, null)),
                                )
                              }
                            />
                          ),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Chip({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
        active
          ? "bg-primary text-white"
          : "border border-neutral-300 text-neutral-500 hover:border-primary hover:text-primary dark:border-neutral-600 dark:text-neutral-400"
      }`}
    >
      {label}
    </button>
  );
}

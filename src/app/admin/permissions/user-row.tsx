"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { PermissionKey } from "@/generated/prisma/enums";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/app-shell/icon";
import {
  PERMISSION_CATEGORIES,
  humanizePermission,
  type AdminUserRow,
} from "./permission-config";
import { PermissionToggle } from "./permission-toggle";
import { RoleBadge } from "./role-badge";

const TOTAL_PERMS = PERMISSION_CATEGORIES.reduce(
  (n, c) => n + c.permissions.length,
  0,
);

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

function accessLevel(held: number): { label: string; pct: number } {
  const pct = TOTAL_PERMS === 0 ? 0 : Math.round((held / TOTAL_PERMS) * 100);
  if (held >= TOTAL_PERMS) return { label: "Full", pct: 100 };
  if (pct >= 60) return { label: "High", pct };
  if (pct >= 35) return { label: "Mid", pct };
  return { label: "Base", pct: Math.max(pct, 8) };
}

export function UserRow({
  user,
  expanded,
  onToggleExpand,
  pending,
  onToggle,
  onReset,
  readOnly = false,
  canDelete,
  onDelete,
  selected,
  onSelectedChange,
}: {
  user: AdminUserRow;
  expanded: boolean;
  onToggleExpand: () => void;
  pending: boolean;
  onToggle: (permission: PermissionKey, grant: boolean) => void;
  onReset: () => void;
  /**
   * When true, permissions are fixed: the editor shows read-only badges instead
   * of toggle chips and hides the reset button. Used for the TM Lead.
   */
  readOnly?: boolean;
  /** Whether this row may be deleted (false for the signed-in admin's own row). */
  canDelete: boolean;
  onDelete: () => void;
  /**
   * Bulk-selection state. Both omitted for the TM Lead's row, which renders no
   * checkbox at all — the same exclusion that already applies to its toggles,
   * reset and delete. A row with no checkbox cannot enter a bulk action, and the
   * server drops any TM_LEAD id regardless.
   */
  selected?: boolean;
  onSelectedChange?: (next: boolean) => void;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const held = new Set(user.permissions);
  const access = accessLevel(held.size);

  return (
    <div className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
      {/* lg and up: the dense grid row, matching the header's columns exactly.
          This collapses at lg rather than the Applicants/Activity Log tables'
          md, because its seven columns include several fixed pixel widths
          (190+110+170+110=580px alone, before gaps or the flexible member
          cell) that don't fit in the ~680px of usable width at 768 — the same
          table-vs-card TECHNIQUE as those pages, just a wider point to switch
          at, since this table genuinely needs more room. */}
      <div className="hidden items-center gap-4 px-5 py-3.5 lg:grid lg:grid-cols-[28px_24px_1fr_190px_110px_170px_110px]">
        {onSelectedChange ? (
          <input
            type="checkbox"
            aria-label={`Select ${user.name}`}
            checked={selected ?? false}
            disabled={pending}
            onChange={(e) => onSelectedChange(e.target.checked)}
            className="size-4 rounded border-neutral-300 text-primary focus:ring-primary/30"
          />
        ) : (
          <span />
        )}
        <button
          onClick={onToggleExpand}
          className="text-neutral-400"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <Icon
            name="expand_more"
            className={`text-[20px] transition-transform duration-150 ease-out motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
          />
        </button>

        <button
          onClick={onToggleExpand}
          className="flex items-center gap-3 text-left"
        >
          <Avatar size="lg">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-foreground">
              {user.name}
            </span>
            <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
              {user.email}
            </span>
          </span>
        </button>

        <div>
          <RoleBadge templateLabel={user.templateLabel} isCustom={user.isCustom} />
        </div>

        <div>
          <span className="rounded px-2 py-0.5 text-[10px] font-bold bg-status-accepted/10 text-status-accepted">
            {user.committee}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="h-2 w-16 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${access.pct}%` }}
            />
          </div>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {access.label}
          </span>
        </div>

        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onToggleExpand}
            disabled={pending}
            className="text-neutral-400 transition-colors duration-150 ease-out hover:text-primary disabled:opacity-50 motion-reduce:transition-none"
            aria-label="Edit permissions"
          >
            <Icon name="more_vert" />
          </button>
          {canDelete && (
            <button
              onClick={() => setDeleteOpen(true)}
              disabled={pending}
              className="text-neutral-400 transition-colors duration-150 ease-out hover:text-status-rejected disabled:opacity-50 motion-reduce:transition-none"
              aria-label={`Delete ${user.name}`}
            >
              <Trash2 className="size-[18px]" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Below lg: one card per member. Same fields as the table row, laid out
          for a lookup-first read rather than a column scan — name loudest,
          role/committee/access as a wrapped chip row, actions inline. Mirrors
          the Applicants card pattern's reasoning: a handful of short fields
          that fit with no truncation, so there's nothing a sticky-column table
          would preserve that a card doesn't already show in full. */}
      <div className="flex flex-col gap-3 px-4 py-3.5 lg:hidden">
        <div className="flex items-start gap-3">
          {onSelectedChange && (
            <input
              type="checkbox"
              aria-label={`Select ${user.name}`}
              checked={selected ?? false}
              disabled={pending}
              onChange={(e) => onSelectedChange(e.target.checked)}
              className="mt-2.5 size-4 shrink-0 rounded border-neutral-300 text-primary focus:ring-primary/30"
            />
          )}
          <button
            onClick={onToggleExpand}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <Avatar size="lg">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-foreground">
                {user.name}
              </span>
              <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                {user.email}
              </span>
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-1 pt-1">
            <button
              onClick={onToggleExpand}
              disabled={pending}
              className="text-neutral-400 transition-colors duration-150 ease-out hover:text-primary disabled:opacity-50 motion-reduce:transition-none"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              <Icon
                name="expand_more"
                className={`text-[20px] transition-transform duration-150 ease-out motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
              />
            </button>
            {canDelete && (
              <button
                onClick={() => setDeleteOpen(true)}
                disabled={pending}
                className="text-neutral-400 transition-colors duration-150 ease-out hover:text-status-rejected disabled:opacity-50 motion-reduce:transition-none"
                aria-label={`Delete ${user.name}`}
              >
                <Trash2 className="size-[18px]" aria-hidden />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pl-1">
          <RoleBadge templateLabel={user.templateLabel} isCustom={user.isCustom} />
          <span className="rounded px-2 py-0.5 text-[10px] font-bold bg-status-accepted/10 text-status-accepted">
            {user.committee}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="h-2 w-12 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${access.pct}%` }}
              />
            </span>
            {access.label} access
          </span>
        </div>
      </div>

      {/* Expanded: permission editor (or read-only view for a fixed role) */}
      {expanded && (
        <div className="border-t border-l-4 border-neutral-100 border-l-primary bg-neutral-50/70 px-5 py-5 dark:border-neutral-800/60 dark:border-l-primary dark:bg-neutral-950/40">
          {readOnly && (
            <p className="mb-4 flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              <Icon name="lock" className="text-[16px]" />
              These permissions are fixed for the TM Lead and can&rsquo;t be
              changed.
            </p>
          )}
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {PERMISSION_CATEGORIES.map((cat) => (
              <div key={cat.title}>
                <h4 className="mb-3 border-b border-neutral-200 pb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  {cat.title}
                </h4>
                <div className="space-y-3">
                  {cat.permissions.map((perm) =>
                    readOnly ? (
                      <div
                        key={perm}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-[13px] text-foreground">
                          {humanizePermission(perm)}
                        </span>
                        {held.has(perm) ? (
                          <span className="rounded-full bg-status-accepted/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-status-accepted">
                            Granted
                          </span>
                        ) : (
                          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
                            Off
                          </span>
                        )}
                      </div>
                    ) : (
                      <PermissionToggle
                        key={perm}
                        permission={perm}
                        on={held.has(perm)}
                        disabled={pending}
                        userName={user.name}
                        onToggle={(grant) => onToggle(perm, grant)}
                      />
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
          {!readOnly && (
            <div className="mt-5 flex justify-end border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <button
                onClick={() => setResetOpen(true)}
                disabled={pending}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-status-rejected transition-colors hover:bg-status-rejected/10 disabled:opacity-50"
              >
                <Icon name="restart_alt" className="text-[18px]" />
                Reset to defaults
              </button>
            </div>
          )}

          {!readOnly && (
            <ConfirmDialog
              open={resetOpen}
              onOpenChange={setResetOpen}
              title={`Reset ${user.name} to defaults?`}
              description={
                <>
                  This wipes all of {user.name}&rsquo;s permission customization
                  and restores the <strong>{user.templateLabel}</strong>{" "}
                  template defaults. This can&rsquo;t be undone.
                </>
              }
              confirmLabel="Reset to defaults"
              destructive
              onConfirm={onReset}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${user.name}?`}
        description={
          <>
            This permanently removes <strong>{user.name}</strong> (
            {user.email}) and all of their permissions and active sessions.
            This can&rsquo;t be undone.
          </>
        }
        confirmLabel="Delete Member"
        cancelLabel="Keep Member"
        destructive
        onConfirm={onDelete}
      />
    </div>
  );
}

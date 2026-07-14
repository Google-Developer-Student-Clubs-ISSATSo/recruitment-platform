"use client";

import { useState } from "react";

import { PermissionKey } from "@/generated/prisma/enums";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "../material-icon";
import {
  PERMISSION_CATEGORIES,
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
}: {
  user: AdminUserRow;
  expanded: boolean;
  onToggleExpand: () => void;
  pending: boolean;
  onToggle: (permission: PermissionKey, grant: boolean) => void;
  onReset: () => void;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  const held = new Set(user.permissions);
  const access = accessLevel(held.size);

  return (
    <div className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
      {/* Row */}
      <div className="grid grid-cols-1 items-center gap-3 px-5 py-3.5 sm:grid-cols-[24px_1fr_190px_110px_170px_110px] sm:gap-4">
        <button
          onClick={onToggleExpand}
          className="hidden text-neutral-400 sm:block"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <Icon
            name="expand_more"
            className={`text-[20px] transition-transform ${expanded ? "rotate-180" : ""}`}
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

        <div className="flex justify-start sm:justify-end">
          <button
            onClick={onToggleExpand}
            disabled={pending}
            className="text-neutral-400 transition-colors hover:text-primary disabled:opacity-50"
            aria-label="Edit permissions"
          >
            <Icon name="more_vert" />
          </button>
        </div>
      </div>

      {/* Expanded: permission editor */}
      {expanded && (
        <div className="border-t border-l-4 border-neutral-100 border-l-primary bg-neutral-50/70 px-5 py-5 dark:border-neutral-800/60 dark:border-l-primary dark:bg-neutral-950/40">
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {PERMISSION_CATEGORIES.map((cat) => (
              <div key={cat.title}>
                <h4 className="mb-3 border-b border-neutral-200 pb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  {cat.title}
                </h4>
                <div className="space-y-3">
                  {cat.permissions.map((perm) => (
                    <PermissionToggle
                      key={perm}
                      permission={perm}
                      on={held.has(perm)}
                      disabled={pending}
                      userName={user.name}
                      onToggle={(grant) => onToggle(perm, grant)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
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

          <ConfirmDialog
            open={resetOpen}
            onOpenChange={setResetOpen}
            title={`Reset ${user.name} to defaults?`}
            description={
              <>
                This wipes all of {user.name}&rsquo;s permission customization
                and restores the <strong>{user.templateLabel}</strong> template
                defaults. This can&rsquo;t be undone.
              </>
            }
            confirmLabel="Reset to defaults"
            destructive
            onConfirm={onReset}
          />
        </div>
      )}
    </div>
  );
}

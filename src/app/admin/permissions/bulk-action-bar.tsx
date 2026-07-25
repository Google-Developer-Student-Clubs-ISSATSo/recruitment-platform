"use client";

import { useState } from "react";
import { motion } from "motion/react";

import { PermissionKey } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app-shell/icon";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";
import { PERMISSION_CATEGORIES } from "./permission-config";

/** Every PermissionKey, grouped the same way the per-user toggle panel groups them. */
const CATEGORISED = PERMISSION_CATEGORIES;

/**
 * Sticky bar shown while a selection exists. Grant and Revoke both route through
 * a ConfirmDialog naming the permission and the exact number of members — these
 * change access for many people at once, and MANAGE_ACCOUNTS or
 * ENTER_FINAL_DECISION across a group is not a routine click.
 */
export function BulkActionBar({
  selectedCount,
  pending,
  onApply,
  onClear,
}: {
  selectedCount: number;
  pending: boolean;
  onApply: (permission: PermissionKey, grant: boolean) => void;
  onClear: () => void;
}) {
  const [permission, setPermission] = useState<PermissionKey | "">("");
  const [confirming, setConfirming] = useState<null | "grant" | "revoke">(null);
  const reduced = useReducedMotion();

  // Mount/unmount is now driven by the caller wrapping this in
  // <AnimatePresence>, keyed on selectedCount > 0 — that's what lets the exit
  // animation actually play instead of the bar vanishing on the same render
  // that clears the selection.
  const memberWord = `${selectedCount} member${selectedCount === 1 ? "" : "s"}`;

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 1 } : { opacity: 0, y: 16 }}
      transition={
        reduced ? { duration: 0 } : { duration: DURATION.base, ease: EASE.out }
      }
      className="sticky bottom-4 z-40 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 shadow-lg backdrop-blur-sm dark:bg-primary/10"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon name="check_circle" className="text-[18px] text-primary" />
        {selectedCount} selected
      </span>

      <select
        aria-label="Permission to grant or revoke"
        value={permission}
        onChange={(e) => setPermission(e.target.value as PermissionKey | "")}
        disabled={pending}
        className="min-w-56 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950"
      >
        <option value="">Select a permission…</option>
        {CATEGORISED.map((cat) => (
          <optgroup key={cat.title} label={cat.title}>
            {cat.permissions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <Button
        size="sm"
        disabled={!permission || pending}
        onClick={() => setConfirming("grant")}
      >
        <Icon name="add_circle" className="text-[16px]" />
        Grant
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={!permission || pending}
        onClick={() => setConfirming("revoke")}
      >
        <Icon name="do_not_disturb_on" className="text-[16px]" />
        Revoke
      </Button>

      <button
        type="button"
        onClick={onClear}
        disabled={pending}
        className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-neutral-500 transition-colors hover:text-foreground disabled:opacity-50 dark:text-neutral-400"
      >
        Clear selection
      </button>

      <ConfirmDialog
        open={confirming === "grant"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Grant ${permission} to ${memberWord}?`}
        description={
          <>
            This gives <strong>{permission}</strong> to all {memberWord} you have
            selected. Anyone who already has it is left unchanged. You can revoke
            it again afterwards.
          </>
        }
        confirmLabel="Grant permission"
        onConfirm={() => permission && onApply(permission, true)}
      />

      <ConfirmDialog
        open={confirming === "revoke"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Revoke ${permission} from ${memberWord}?`}
        description={
          <>
            This removes <strong>{permission}</strong> from all {memberWord} you
            have selected, including anyone whose role template grants it — they
            will show as <strong>Custom</strong> afterwards. Anyone who
            doesn&rsquo;t have it is left unchanged.
          </>
        }
        confirmLabel="Revoke permission"
        destructive
        onConfirm={() => permission && onApply(permission, false)}
      />
    </motion.div>
  );
}

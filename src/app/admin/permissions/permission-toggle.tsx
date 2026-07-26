"use client";

import { useState } from "react";
import { motion } from "motion/react";

import { PermissionKey } from "@/generated/prisma/enums";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";
import {
  HIGH_CONSEQUENCE_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  humanizePermission,
} from "./permission-config";

/**
 * A single permission toggle chip. Owns its own confirmation gate: turning OFF
 * a high-consequence permission opens a ConfirmDialog first; every other
 * transition (turning one on, or toggling a low-stakes permission off) applies
 * immediately with no prompt.
 */
export function PermissionToggle({
  permission,
  on,
  disabled,
  userName,
  onToggle,
}: {
  permission: PermissionKey;
  on: boolean;
  disabled: boolean;
  userName: string;
  onToggle: (grant: boolean) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Bumped on every actual toggle (not on mount), so the knob can pop on each
  // change without replaying on first render.
  const [flips, setFlips] = useState(0);
  const reduced = useReducedMotion();
  const label = humanizePermission(permission);
  const definition = PERMISSION_DEFINITIONS[permission];
  // Ties the sentence to the switch for screen readers without folding it into
  // the button's accessible NAME, which would make every toggle announce as a
  // full paragraph. The id is per-user so two rows expanded at once stay unique.
  const descriptionId = `perm-def-${userName.replace(/\W+/g, "-")}-${permission}`;
  // Only a turn-OFF of a high-consequence permission needs confirmation.
  const needsConfirm = on && HIGH_CONSEQUENCE_PERMISSIONS.has(permission);

  function commit(next: boolean) {
    if (!reduced) setFlips((n) => n + 1);
    onToggle(next);
  }

  function handleClick() {
    if (needsConfirm) {
      setConfirmOpen(true);
    } else {
      commit(!on);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-pressed={on}
        aria-describedby={descriptionId}
        className="flex w-full items-center justify-between gap-3 text-left disabled:opacity-60"
      >
        <span className="text-[13px] text-foreground">{label}</span>
        <span
          className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 ease-out motion-reduce:transition-none ${
            on ? "bg-primary" : "bg-neutral-300 dark:bg-neutral-600"
          }`}
        >
          <motion.span
            key={flips}
            initial={flips === 0 || reduced ? false : { scale: 0.8 }}
            animate={{ scale: 1, x: on ? 16 : 0 }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: DURATION.fast, ease: EASE.out }
            }
            className="h-4 w-4 rounded-full bg-white"
          />
        </span>
      </button>

      {/* The definition sits under the row rather than beside it: at four
          columns on xl there is no horizontal room for a sentence, and the
          toggle must stay flush right where the eye scans for switch state. */}
      <p
        id={descriptionId}
        className="mt-1 pr-12 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400"
      >
        {definition}
      </p>

      {needsConfirm && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Revoke “${label}”?`}
          description={
            <>
              This removes a high-consequence permission from{" "}
              <strong>{userName}</strong>. They lose that access immediately. You
              can re-grant it later.
            </>
          }
          confirmLabel="Revoke"
          destructive
          onConfirm={() => commit(false)}
        />
      )}
    </div>
  );
}

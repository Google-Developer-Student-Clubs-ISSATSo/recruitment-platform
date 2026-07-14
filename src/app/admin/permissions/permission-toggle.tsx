"use client";

import { useState } from "react";

import { PermissionKey } from "@/generated/prisma/enums";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { HIGH_CONSEQUENCE_PERMISSIONS, humanizePermission } from "./permission-config";

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
  const label = humanizePermission(permission);
  // Only a turn-OFF of a high-consequence permission needs confirmation.
  const needsConfirm = on && HIGH_CONSEQUENCE_PERMISSIONS.has(permission);

  function handleClick() {
    if (needsConfirm) {
      setConfirmOpen(true);
    } else {
      onToggle(!on);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-pressed={on}
        className="flex w-full items-center justify-between gap-3 text-left disabled:opacity-60"
      >
        <span className="text-[13px] text-foreground">{label}</span>
        <span
          className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
            on ? "bg-primary" : "bg-neutral-300 dark:bg-neutral-600"
          }`}
        >
          <span
            className={`h-4 w-4 rounded-full bg-white transition-transform ${
              on ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </span>
      </button>

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
          onConfirm={() => onToggle(false)}
        />
      )}
    </>
  );
}

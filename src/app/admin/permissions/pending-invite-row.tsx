"use client";

import { useState, useTransition } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { timeAgo } from "@/lib/activity-descriptions";
import { Icon } from "../material-icon";
import { cancelInvite, resendInvite } from "./actions";
import type { PendingInviteRow as PendingInvite } from "./permission-config";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

// One PENDING invite: visually distinct from active members (dashed accent +
// a "Pending" tag), with Resend and Cancel actions.
export function PendingInviteRow({ invite }: { invite: PendingInvite }) {
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);

  function resend() {
    startTransition(async () => {
      await resendInvite(invite.id);
    });
  }
  function doCancel() {
    startTransition(async () => {
      await cancelInvite(invite.id);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-5 py-3.5 last:border-0 dark:border-neutral-800/60">
      <Avatar size="lg" className="opacity-80">
        <AvatarFallback className="bg-status-pending/15 text-xs font-semibold text-neutral-500 dark:text-neutral-300">
          {initials(invite.name)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-foreground">
            {invite.name}
          </span>
          <Badge
            variant="secondary"
            className="border-transparent bg-status-pending/15 font-bold text-[color:var(--status-pending)]"
          >
            Pending
          </Badge>
        </div>
        <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
          {invite.email} · invited {timeAgo(invite.createdAtISO)}
        </span>
      </div>

      <span className="rounded px-2 py-0.5 text-[10px] font-bold bg-status-accepted/10 text-status-accepted">
        {invite.committee}
      </span>
      <span className="hidden text-xs text-neutral-500 sm:inline dark:text-neutral-400">
        {invite.templateLabel}
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={resend}
          disabled={pending}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
        >
          <Icon name="mail" className="text-[16px]" />
          Resend
        </button>
        <button
          onClick={() => setCancelOpen(true)}
          disabled={pending}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-status-rejected transition-colors hover:bg-status-rejected/10 disabled:opacity-50"
        >
          <Icon name="cancel" className="text-[16px]" />
          Cancel
        </button>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this invitation?"
        description={
          <>
            The pending invite for <strong>{invite.email}</strong> will be
            cancelled and its accept link will stop working.
          </>
        }
        confirmLabel="Cancel Invite"
        cancelLabel="Keep Invite"
        destructive
        onConfirm={doCancel}
      />
    </div>
  );
}

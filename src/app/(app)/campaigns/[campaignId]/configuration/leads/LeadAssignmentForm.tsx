"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/app-shell/icon";
import { Button } from "@/components/ui/button";
import type { Committee, LeadRole } from "@/generated/prisma/enums";
import type { LeadHolder } from "@/lib/campaign-leads";
import { assignLead } from "./actions";

const NONE = "";

export function LeadAssignmentForm({
  campaignId,
  role,
  roleLabel,
  currentHolder,
  memberOptions,
  requiredCommittee,
}: {
  campaignId: string;
  role: LeadRole;
  roleLabel: string;
  currentHolder: LeadHolder;
  /** Already narrowed to eligible members by the server section. */
  memberOptions: { id: string; label: string }[];
  /** The committee this title requires, or null when it's open to anyone. */
  requiredCommittee: Committee | null;
}) {
  const [selected, setSelected] = useState(currentHolder?.userId ?? NONE);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = selected !== (currentHolder?.userId ?? NONE);

  function assign() {
    if (!selected) return;
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await assignLead(campaignId, role, selected);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to assign lead.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{roleLabel}</span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {currentHolder ? currentHolder.name : "Not assigned"}
        </span>
      </div>

      {requiredCommittee && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {memberOptions.length === 0
            ? `No ${requiredCommittee} members to appoint yet.`
            : `${requiredCommittee} members only.`}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <select
          aria-label={`Assign ${roleLabel}`}
          value={selected}
          disabled={pending || memberOptions.length === 0}
          onChange={(e) => {
            setSelected(e.target.value);
            setSaved(false);
            setError(null);
          }}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950"
        >
          <option value={NONE} disabled>
            Choose a member…
          </option>
          {memberOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <Button
          onClick={assign}
          disabled={pending || !selected || !dirty}
          className="shrink-0"
        >
          {pending ? "Saving…" : currentHolder ? "Reassign" : "Assign"}
        </Button>
      </div>

      {saved && !pending && (
        <span className="mt-2 flex items-center gap-1 text-sm text-status-accepted">
          <Icon name="check" className="text-[16px]" />
          Saved
        </span>
      )}
      {error && (
        <span className="mt-2 flex items-center gap-1 text-sm text-status-rejected">
          <Icon name="error" className="text-[16px]" />
          {error}
        </span>
      )}
    </div>
  );
}

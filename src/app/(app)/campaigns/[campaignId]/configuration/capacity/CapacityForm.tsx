"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/app-shell/icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Committee } from "@/generated/prisma/enums";
import {
  CAPACITY_COMMITTEES,
  sanitizeTarget,
  type CapacityTargets,
} from "@/lib/committee-capacity";
import { updateCommitteeCapacity } from "./actions";

// Fields are held as strings so the input can legitimately be empty while being
// retyped. An empty or unparseable field counts as 0 — both for the live total
// and for what gets saved — since target is a non-null seat count, not the
// nullable "no threshold" of the scoring config next door.
type Draft = Record<Committee, string>;

// Same sanitizer the action applies server-side, so the total shown while
// editing is the total of what a save would actually store.
function toTarget(s: string): number {
  return sanitizeTarget(Number(s.trim()));
}

function toDraft(targets: CapacityTargets): Draft {
  return Object.fromEntries(
    CAPACITY_COMMITTEES.map((c) => [c, String(targets[c])]),
  ) as Draft;
}

export function CapacityForm({
  campaignId,
  initialTargets,
}: {
  campaignId: string;
  initialTargets: CapacityTargets;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialTargets));
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // Recomputed on every keystroke from the draft, not from what's stored — the
  // point of the figure is to show the consequence of an edit before saving it.
  const total = CAPACITY_COMMITTEES.reduce((sum, c) => sum + toTarget(draft[c]), 0);

  function save() {
    setSaved(false);
    startTransition(async () => {
      const targets = Object.fromEntries(
        CAPACITY_COMMITTEES.map((c) => [c, toTarget(draft[c])]),
      ) as CapacityTargets;

      // Re-seed the fields from what the server actually stored, so a value the
      // sanitizer changed (a negative, a decimal) is visibly corrected.
      setDraft(toDraft(await updateCommitteeCapacity(campaignId, targets)));
      setSaved(true);
    });
  }

  return (
    <div className="mt-5">
      {/* Three inputs and the total share one row on sm+; the total is a peer
          of the fields rather than a footnote, since it's the number the user
          is actually steering toward when editing them. */}
      <div className="flex flex-wrap items-end gap-4">
        {CAPACITY_COMMITTEES.map((committee) => (
          <div key={committee} className="w-28">
            <label
              htmlFor={`capacity-${committee}`}
              className="mb-1 block text-sm font-medium text-foreground"
            >
              {committee}
            </label>
            <Input
              id={`capacity-${committee}`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={draft[committee]}
              disabled={pending}
              onChange={(e) => {
                setDraft((d) => ({ ...d, [committee]: e.target.value }));
                setSaved(false);
              }}
              className="tabular-nums"
            />
          </div>
        ))}

        <div
          aria-live="polite"
          className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-300"
        >
          <span className="font-semibold tabular-nums text-foreground">
            {total} total
          </span>{" "}
          seats across all committees
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {saved && !pending && (
          <span className="flex items-center gap-1 text-sm text-status-accepted">
            <Icon name="check" className="text-[16px]" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}

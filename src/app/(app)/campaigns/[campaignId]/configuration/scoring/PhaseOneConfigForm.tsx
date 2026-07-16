"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/app-shell/icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updatePhaseOneConfig } from "./actions";

// Empty string ⇄ null: a cleared field means "no threshold / no target", not 0.
function toNumOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// The PhaseOneConfig section — rejectThreshold + targetCount, saved together.
// Separate from the question list but on the same page and scoped to the same
// campaign. Kept as a small explicit Save form (rather than save-on-blur) since
// these two thresholds drive auto-classification and deserve a deliberate save.
export function PhaseOneConfigForm({
  campaignId,
  rejectThreshold,
  targetCount,
}: {
  campaignId: string;
  rejectThreshold: number | null;
  targetCount: number | null;
}) {
  const [reject, setReject] = useState(
    rejectThreshold === null ? "" : String(rejectThreshold),
  );
  const [target, setTarget] = useState(
    targetCount === null ? "" : String(targetCount),
  );
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setSaved(false);
    startTransition(async () => {
      await updatePhaseOneConfig(
        campaignId,
        toNumOrNull(reject),
        toNumOrNull(target),
      );
      setSaved(true);
    });
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="rule" className="text-[22px]" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Auto-classification thresholds
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Drive how weighted totals map to accept / reject / discuss.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="rejectThreshold"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Reject threshold
          </label>
          <Input
            id="rejectThreshold"
            type="number"
            min={0}
            step="any"
            value={reject}
            disabled={pending}
            onChange={(e) => {
              setReject(e.target.value);
              setSaved(false);
            }}
            placeholder="e.g. 40"
            className="tabular-nums"
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Weighted totals below this are auto-rejected.
          </p>
        </div>
        <div>
          <label
            htmlFor="targetCount"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Target count
          </label>
          <Input
            id="targetCount"
            type="number"
            min={0}
            step={1}
            value={target}
            disabled={pending}
            onChange={(e) => {
              setTarget(e.target.value);
              setSaved(false);
            }}
            placeholder="e.g. 8"
            className="tabular-nums"
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            How many applicants to advance from Phase 1.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save thresholds"}
        </Button>
        {saved && !pending && (
          <span className="flex items-center gap-1 text-sm text-status-accepted">
            <Icon name="check" className="text-[16px]" />
            Saved
          </span>
        )}
      </div>
    </section>
  );
}

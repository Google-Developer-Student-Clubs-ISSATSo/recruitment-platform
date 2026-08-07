"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/app-shell/icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { MktSkill } from "@/lib/mkt-skills-store";

import { addMktSkill, removeMktSkill } from "./actions";

// Add/remove list for the campaign's MKT skill whitelist. Both mutations go
// through server actions that re-check CONFIGURE_SCREENING and revalidate the
// Phase 2 page, so the tally there reflects an edit on its next load with no
// per-applicant action — the retroactive-credit behaviour is a property of the
// live tally, not something this form triggers.
export function MktSkillsForm({
  campaignId,
  skills,
}: {
  campaignId: string;
  skills: MktSkill[];
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<MktSkill | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    const name = draft.trim();
    if (name === "") return;
    setError(null);
    startTransition(async () => {
      const res = await addMktSkill(campaignId, name);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Cleared only on success, so a rejected value stays in the field to be
      // corrected rather than making the user retype it.
      setDraft("");
    });
  }

  function remove(skill: MktSkill) {
    setError(null);
    startTransition(async () => {
      const res = await removeMktSkill(campaignId, skill.id);
      if (!res.ok) setError(res.error);
      setConfirming(null);
    });
  }

  return (
    <div className="mt-5">
      {skills.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No skills on the list. The Phase 2 breakdown counts nothing until you
          add one.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <li
              key={skill.id}
              className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 py-1 pl-3 pr-1.5 text-sm text-foreground dark:border-neutral-800 dark:bg-neutral-950/40"
            >
              {skill.skillName}
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirming(skill)}
                aria-label={`Remove ${skill.skillName}`}
                className="flex size-5 items-center justify-center rounded-full text-neutral-400 transition-colors duration-150 ease-out hover:bg-status-rejected/10 hover:text-status-rejected disabled:opacity-50 motion-reduce:transition-none"
              >
                <Icon name="close" className="text-[14px]" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-start gap-3">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="mkt-skill-input" className="sr-only">
            Skill name
          </label>
          <Input
            id="mkt-skill-input"
            value={draft}
            disabled={pending}
            placeholder="e.g. Illustrator"
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button onClick={add} disabled={pending || draft.trim() === ""}>
          {pending ? "Saving…" : "Add skill"}
        </Button>
      </div>

      {error && <p className="mt-2 text-sm text-status-rejected">{error}</p>}

      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
        Match the form&rsquo;s wording exactly — values are compared
        case-insensitively but otherwise literally, so a skill spelled
        differently from the submitted answer will always show 0.
      </p>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Remove “${confirming?.skillName}”?`}
        description="It stops being counted in the Phase 2 MKT Skills Breakdown immediately. No applicant data changes, and you can add it back at any time."
        confirmLabel="Remove"
        destructive
        onConfirm={() => confirming && remove(confirming)}
      />
    </div>
  );
}

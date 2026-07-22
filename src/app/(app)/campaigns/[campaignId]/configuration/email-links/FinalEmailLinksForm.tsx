"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/app-shell/icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  FINAL_EMAIL_LINK_FIELDS,
  type FinalEmailLinkKey,
  type FinalEmailLinks,
} from "@/lib/final-email-links";
import { updateFinalEmailLinksAction } from "./actions";

type Draft = Record<FinalEmailLinkKey, string>;

function toDraft(links: FinalEmailLinks): Draft {
  return Object.fromEntries(
    FINAL_EMAIL_LINK_FIELDS.map((f) => [f.key, links[f.key] ?? ""]),
  ) as Draft;
}

// All four links save together as one form. They're only ever meaningful as a
// set — the send batch needs every one of them before it will run — so a
// per-field save would just produce more ways to be half-configured.
export function FinalEmailLinksForm({
  campaignId,
  initialLinks,
}: {
  campaignId: string;
  initialLinks: FinalEmailLinks;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialLinks));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const missing = FINAL_EMAIL_LINK_FIELDS.filter(
    (f) => draft[f.key].trim() === "",
  ).length;

  function save() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await updateFinalEmailLinksAction(campaignId, draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft(toDraft(res.links));
      setSaved(true);
    });
  }

  return (
    <div className="mt-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {FINAL_EMAIL_LINK_FIELDS.map((field) => (
          <div key={field.key}>
            <label
              htmlFor={field.key}
              className="mb-1 block text-sm font-medium text-foreground"
            >
              {field.label}
            </label>
            <Input
              id={field.key}
              type="url"
              inputMode="url"
              value={draft[field.key]}
              disabled={pending}
              placeholder={field.placeholder}
              onChange={(e) => {
                setDraft((d) => ({ ...d, [field.key]: e.target.value }));
                setSaved(false);
              }}
            />
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {field.hint}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save links"}
        </Button>
        {saved && !pending && (
          <span className="flex items-center gap-1 text-sm text-status-accepted">
            <Icon name="check" className="text-[16px]" />
            Saved
          </span>
        )}
        {error && (
          <span className="text-sm font-medium text-status-rejected">
            {error}
          </span>
        )}
        {missing > 0 && !error && (
          <span className="flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400">
            <Icon name="info" className="text-[16px]" />
            {missing} still empty — final result emails stay blocked until all
            four are set.
          </span>
        )}
      </div>
    </div>
  );
}

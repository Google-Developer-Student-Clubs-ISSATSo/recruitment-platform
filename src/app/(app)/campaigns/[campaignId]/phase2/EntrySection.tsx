"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/app-shell/icon";
import { splitTimestamp } from "@/lib/activity-descriptions";
import { PHASE2_ENTRY_MAX_LENGTH, type Phase2Section } from "@/lib/phase2";
import type { Phase2Entry } from "@/lib/phase2-store";
import { addPhase2EntryAction } from "./actions";

// Per-tone styling. Tokens only — no hex anywhere — and the mapping keeps its
// app-wide meaning: green = good, red = bad, neutral = neither.
const TONE = {
  neutral: {
    header: "text-neutral-500 dark:text-neutral-400",
    entry: "border-neutral-200 dark:border-neutral-800",
    button: "bg-primary text-white hover:bg-primary/90",
  },
  rejected: {
    header: "text-status-rejected",
    entry: "border-status-rejected/30 bg-status-rejected/5",
    button: "bg-status-rejected text-white hover:bg-status-rejected/90",
  },
  accepted: {
    header: "text-status-accepted",
    entry: "border-status-accepted/30 bg-status-accepted/5",
    button: "bg-status-accepted text-white hover:bg-status-accepted/90",
  },
} as const;

/**
 * One of the three logs on an applicant: existing entries oldest-first, then the
 * box to append another.
 *
 * Oldest-first is the deliberate choice throughout: entries are append-only, so
 * a later one may exist purely to correct an earlier one, and a correction has
 * to read *after* the thing it corrects to make sense. There is no edit or
 * delete affordance here, and that's the point — see the Phase2Entry model.
 *
 * Newly added entries are appended to local state as well as revalidated on the
 * server, so the author sees their entry land without the whole page flashing.
 */
export function EntrySection({
  campaignId,
  applicantId,
  section,
  entries,
  authorName,
}: {
  campaignId: string;
  applicantId: string;
  section: Phase2Section;
  entries: Phase2Entry[];
  /** The current user's display name, for the optimistic row. */
  authorName: string;
}) {
  const [rows, setRows] = useState(entries);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tone = TONE[section.tone];

  // Adopt a NEW server payload when one arrives — what makes the page's Refresh
  // button actually surface an entry a different reviewer just added. Without
  // this, `rows` would keep the copy taken at mount forever: a soft refresh
  // (router.refresh) streams fresh props into this component rather than
  // remounting it, so the useState initialiser above never runs again.
  //
  // Compared by CONTENT, not reference: <ApplicantCard> rebuilds this prop with
  // .filter() on every render, so a reference check would fire constantly and
  // wipe the optimistic row below on each keystroke. Entries are append-only
  // with stable ids, so the id list is a faithful signature — it changes
  // exactly when the server's set of entries does.
  //
  // Written as a during-render adjustment rather than an effect (React's
  // documented "adjusting state when a prop changes" pattern): it re-renders
  // before paint, so a refresh never flashes the stale list first.
  const serverSignature = entries.map((e) => e.id).join(",");
  const [syncedSignature, setSyncedSignature] = useState(serverSignature);
  if (serverSignature !== syncedSignature) {
    setSyncedSignature(serverSignature);
    setRows(entries);
  }

  function submit() {
    const trimmed = text.trim();
    if (trimmed === "" || pending) return;
    setError(null);

    startTransition(async () => {
      const result = await addPhase2EntryAction(
        campaignId,
        applicantId,
        section.type,
        trimmed,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRows((prev) => [
        ...prev,
        {
          // Temporary id for the key only — the server revalidation replaces
          // this row with the real one on the next render.
          id: `pending-${Date.now()}`,
          type: section.type,
          authorName,
          createdAtISO: new Date().toISOString(),
          text: trimmed,
        },
      ]);
      setText("");
    });
  }

  return (
    <div className="min-w-0">
      <h4
        className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${tone.header}`}
      >
        <Icon name={section.icon} className="text-[15px]" />
        {section.label}
        <span className="font-normal text-neutral-400">({rows.length})</span>
      </h4>

      <div className="mt-2 space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm italic text-neutral-400">
            Nothing recorded yet.
          </p>
        ) : (
          rows.map((entry) => {
            const { date, time } = splitTimestamp(entry.createdAtISO);
            return (
              <div
                key={entry.id}
                className={`rounded-lg border px-3 py-2 ${tone.entry}`}
              >
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {entry.text}
                </p>
                <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                  {entry.authorName} · {date}, {time.slice(0, 5)}
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={PHASE2_ENTRY_MAX_LENGTH}
          placeholder={`Add a ${section.singular}…`}
          aria-label={`Add a ${section.singular}`}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-foreground dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={pending || text.trim() === ""}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tone.button}`}
          >
            <Icon name="add" className="text-[14px]" />
            {pending ? "Adding…" : "Add"}
          </button>
          <p className="text-[11px] text-neutral-400">
            Permanent — entries can&apos;t be edited or deleted.
          </p>
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-status-rejected">{error}</p>
        )}
      </div>
    </div>
  );
}

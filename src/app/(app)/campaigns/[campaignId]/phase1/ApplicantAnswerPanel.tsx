"use client";

import { Icon } from "@/components/app-shell/icon";
import type { Phase1Question, ViewMode } from "./types";

// Exact rawFormData keys for the two profile links shown in the technical-only
// view. These match the CSV headers.
const GITHUB_FIELD = "GitHub link";
const LINKEDIN_FIELD = "LinkedIn link";

// Reading pane. One component, two modes (STEP 5 — a variant, not a duplicate):
//   - "full": for each ACTIVE question with a non-null sourceField, show the
//     question text and the answer from rawFormData[sourceField]; a missing key
//     renders a clear "No answer found" state.
//   - "technical-only": show ONLY name + GitHub + LinkedIn as clickable links.
//     The other 8 questions' text/answers aren't rendered here because the
//     server never sends them to this viewer (rawFormData is pre-stripped).
export function ApplicantAnswerPanel({
  viewMode,
  fullName,
  questions,
  rawFormData,
}: {
  viewMode: ViewMode;
  fullName: string;
  questions: Phase1Question[];
  rawFormData: Record<string, unknown> | null;
}) {
  if (viewMode === "technical-only") {
    return (
      <div className="space-y-4">
        <InfoCard label="Full name" value={fullName} />
        <LinkCard
          label="GitHub"
          icon="code"
          url={readString(rawFormData, GITHUB_FIELD)}
        />
        <LinkCard
          label="LinkedIn"
          icon="link"
          url={readString(rawFormData, LINKEDIN_FIELD)}
        />
        <p className="text-xs text-neutral-400">
          Technical scorers only see identifying details and profile links.
        </p>
      </div>
    );
  }

  const answered = questions.filter((q) => q.sourceField !== null);
  return (
    <div className="space-y-4">
      {answered.map((q) => {
        const answer = readString(rawFormData, q.sourceField as string);
        return (
          <div
            key={q.id}
            className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <p className="text-sm font-semibold text-foreground">{q.text}</p>
            {answer ? (
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                {answer}
              </p>
            ) : (
              <p className="mt-1.5 flex items-center gap-1.5 text-sm italic text-[color:var(--status-pending)]">
                <Icon name="help" className="text-[16px]" />
                No answer found for this field
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Return a trimmed string for `key`, or "" if missing/blank/non-string.
function readString(
  data: Record<string, unknown> | null,
  key: string,
): string {
  const raw = data ? data[key] : undefined;
  return typeof raw === "string" ? raw.trim() : "";
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function LinkCard({
  label,
  icon,
  url,
}: {
  label: string;
  icon: string;
  url: string;
}) {
  const href = url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : null;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        <Icon name={icon} className="text-[15px]" />
        {label}
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 break-all text-sm font-medium text-primary hover:underline"
        >
          {url}
          <Icon name="open_in_new" className="text-[14px]" />
        </a>
      ) : (
        <p className="mt-1 text-sm italic text-neutral-400">Not provided</p>
      )}
    </div>
  );
}

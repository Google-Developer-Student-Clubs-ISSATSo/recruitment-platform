import Link from "next/link";

import { Icon } from "@/components/app-shell/icon";
import { getInterviewSnapshot } from "@/lib/campaign-dashboard";
import { PANEL_COMMITTEES } from "@/lib/interview-slot";

// Today's interview load, for anyone who can sit on a panel. Rendered only for
// CLAIM_PANEL_SEAT holders (the <PermissionGate> in page.tsx) — the same
// permission that opens the Interviews page this links to, so the link can
// never lead somewhere the reader would be bounced off.
//
// Loads its own data so an ungated viewer never triggers the queries.
export async function InterviewsTodayCard({
  campaignId,
}: {
  campaignId: string;
}) {
  const { today, needingPanel, scheduled } = await getInterviewSnapshot(campaignId);

  return (
    <section className="flex flex-col rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3 border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="video_chat" className="text-[20px]" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Interviews</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {scheduled} scheduled on this campaign.
          </p>
        </div>
      </div>

      <div className="grid flex-1 gap-4 p-6 sm:grid-cols-2">
        <div
          role="group"
          aria-label={`${today} interviews scheduled today`}
          className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Today
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
            {today}
          </p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {today === 0
              ? "Nothing on the calendar today."
              : `Interview${today === 1 ? "" : "s"} today.`}
          </p>
        </div>

        <div
          role="group"
          aria-label={`${needingPanel} interviews still need a full panel`}
          className={`rounded-lg border p-4 ${
            needingPanel > 0
              ? "border-status-pending/40"
              : "border-neutral-200 dark:border-neutral-800"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Need a panel
          </p>
          <p
            className={`mt-1 text-3xl font-bold tabular-nums ${
              needingPanel > 0
                ? "text-[color:var(--status-pending)]"
                : "text-status-accepted"
            }`}
          >
            {needingPanel}
          </p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {needingPanel === 0
              ? "Every panel is fully staffed."
              : `Fewer than ${PANEL_COMMITTEES.length} seats claimed.`}
          </p>
        </div>
      </div>

      <div className="border-t border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <Link
          href={`/campaigns/${campaignId}/interviews`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-opacity hover:opacity-80"
        >
          Go to Interviews
          <Icon name="arrow_forward" className="text-[18px]" />
        </Link>
      </div>
    </section>
  );
}

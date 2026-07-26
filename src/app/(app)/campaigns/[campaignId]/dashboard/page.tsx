import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PermissionKey } from "@/generated/prisma/enums";
import { PermissionGate } from "@/components/permission-gate";
import { Icon } from "@/components/app-shell/icon";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";
import { tunisDayDelta } from "@/lib/campaign-dashboard";
import { getCampaignCounts } from "@/lib/campaign-statistics";
import { formatTunisDate, formatTunisDateTime } from "@/lib/tunis-time";
import { CapacityWidget } from "./CapacityWidget";
import { InterviewsTodayCard } from "./InterviewsTodayCard";
import { PipelineFunnel } from "./PipelineFunnel";
import { QuickLinksGrid } from "./QuickLinksGrid";
import { StatCard } from "./StatCard";

// The campaign dashboard — the landing page for everyone the campaign layout
// let in (an open-campaign worker, or a VIEW_CAMPAIGN_HISTORY holder viewing an
// archived one).
//
// The page itself is NOT gated: reaching a campaign at all is the only entry
// requirement, and the top stat cards are aggregate counts rather than
// per-applicant detail, so everyone who gets here sees them. Everything below
// them is wrapped in its own <PermissionGate>, so a plain committee rep sees
// the counts, their interviews widget, and nothing else — no headings or empty
// shells for widgets they can't use.
//
// This file is composition only. Each widget loads its own data, which is what
// makes the gates cheap: an ungated viewer never triggers the queries behind a
// widget that isn't rendered for them.

/** GDG Day copy for the third stat card, from the campaign's stored instant. */
function gdgDay(at: Date | null) {
  if (!at) {
    return {
      value: "Not yet scheduled",
      hint: "Set the date and time on the Phase 1 Selection page.",
      chip: undefined,
      tone: "neutral" as const,
    };
  }

  const days = tunisDayDelta(at);
  const value =
    days === 0
      ? "Today"
      : days > 0
        ? `In ${days} day${days === 1 ? "" : "s"}`
        : `${-days} day${days === -1 ? "" : "s"} ago`;

  return {
    value,
    hint: formatTunisDateTime(at),
    chip: days === 0 ? "Happening today" : undefined,
    tone: days >= 0 ? ("pending" as const) : ("neutral" as const),
  };
}

export default async function CampaignDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ denied?: string }>;
}) {
  const { campaignId } = await params;
  const { denied } = await searchParams;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [campaign, counts] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        name: true,
        isOpen: true,
        phaseOneFinalizedAt: true,
        finalDecisionCompletedAt: true,
        gdgDayDateTime: true,
      },
    }),
    getCampaignCounts(campaignId),
  ]);
  if (!campaign) notFound();

  const gdg = gdgDay(campaign.gdgDayDateTime);

  return (
    // Matches the Configuration page and the Stitch reference's 1440px content
    // area — the widget row and the quick-links grid both need the width.
    <div className="mx-auto max-w-[1440px] space-y-6">
      {denied === "1" && (
        <div className="rounded-lg border border-status-rejected/30 bg-status-rejected/10 px-4 py-3 text-sm font-medium text-status-rejected">
          You don&apos;t have access to that page.
        </div>
      )}

      {/* STEP 1 — campaign identity, open/closed state, and the two milestones
          that mark how far the campaign has actually progressed. */}
      <header>
        <div className="flex flex-wrap items-center gap-3">
          {/* min-w-0 + wrapping so a long campaign name shares the row with the
              Open/Closed pill at 375px instead of pushing it off-screen. */}
          <h1 className="min-w-0 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {campaign.name}
          </h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
              campaign.isOpen
                ? "bg-status-accepted/10 text-status-accepted"
                : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
            }`}
          >
            {campaign.isOpen ? "Open" : "Closed"}
          </span>
        </div>

        <p className="mt-1 text-base text-neutral-500 dark:text-neutral-400">
          Live snapshot of this campaign. Every number is counted as you load
          the page.
        </p>

        {(campaign.phaseOneFinalizedAt || campaign.finalDecisionCompletedAt) && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            {campaign.phaseOneFinalizedAt && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-status-accepted">
                <Icon name="check_circle" className="text-[16px]" />
                Phase 1 finalized on{" "}
                {formatTunisDate(campaign.phaseOneFinalizedAt)}
              </p>
            )}
            {campaign.finalDecisionCompletedAt && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-status-accepted">
                <Icon name="check_circle" className="text-[16px]" />
                Final decisions completed on{" "}
                {formatTunisDate(campaign.finalDecisionCompletedAt)}
              </p>
            )}
          </div>
        )}
      </header>

      {/* STEP 2 — aggregate counts, ungated: these are pool-level totals, not
          per-applicant detail, so anyone inside the campaign may see them.
          One column at 375px, two from sm, three from lg. The three-up row only
          returns at lg rather than md because the middle card carries a 3-column
          breakdown that gets cramped in a ~240px column. */}
      <StaggerGroup className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        <StaggerItem>
          <StatCard
            icon="person_add"
            tone="primary"
            label="Total Applicants"
            value={counts.total}
            hint={
              counts.total === 0
                ? "No applications imported yet."
                : "In this campaign."
            }
          />
        </StaggerItem>

        <StaggerItem>
          <StatCard icon="fact_check" tone="pending" label="Phase 1 Status">
            <dl className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
              {[
                {
                  label: "Submitted",
                  value: counts.submitted,
                  className: "text-foreground",
                },
                {
                  label: "Shortlisted",
                  value: counts.shortlisted,
                  className: "text-primary",
                },
                {
                  label: "Rejected",
                  value: counts.rejectedPhaseOne,
                  className: "text-status-rejected",
                },
              ].map((item) => (
                <div key={item.label}>
                  {/* No tracking-wider here (unlike the card's own label): at
                      375px these three sit in ~90px columns and the extra
                      letter-spacing is what tips "Shortlisted" into wrapping. */}
                  <dt className="text-[10px] font-semibold uppercase text-neutral-500 sm:text-[11px] dark:text-neutral-400">
                    {item.label}
                  </dt>
                  <dd
                    className={`text-xl font-bold tabular-nums sm:text-2xl ${item.className}`}
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </StatCard>
        </StaggerItem>

        <StaggerItem>
          <StatCard
            icon="event_available"
            tone={gdg.tone}
            label="GDG Day"
            value={gdg.value}
            hint={gdg.hint}
            chip={gdg.chip}
            chipTone="pending"
          />
        </StaggerItem>
      </StaggerGroup>

      {/* STEPS 3, 4 & 5 — gated on their own permission where they have one
          (the funnel has none), and all three in one stagger group so they
          arrive as a single sequence rather than three independent runs.

          The funnel/interviews row stays a flex row rather than a fixed column
          grid so whichever widgets survive their gates fill the width: the funnel
          takes twice the interviews card when both render, and either one alone
          stretches to full width instead of leaving a stranded gap. */}
      <StaggerGroup className="space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* The funnel is ungated — statistics are open to every member. */}
          <StaggerItem className="lg:min-w-0 lg:grow-[2] lg:basis-0">
            <PipelineFunnel campaignId={campaignId} />
          </StaggerItem>

          <PermissionGate permission={PermissionKey.CLAIM_PANEL_SEAT}>
            <StaggerItem className="lg:min-w-0 lg:grow lg:basis-0">
              <InterviewsTodayCard campaignId={campaignId} />
            </StaggerItem>
          </PermissionGate>
        </div>

        {/* Capacity belongs to whoever runs the decision meeting or sets the
            targets, so either permission opens it. */}
        <PermissionGate
          permission={[
            PermissionKey.ENTER_FINAL_DECISION,
            PermissionKey.MANAGE_CAPACITY,
          ]}
        >
          <StaggerItem>
            <CapacityWidget campaignId={campaignId} />
          </StaggerItem>
        </PermissionGate>
      </StaggerGroup>

      {/* STEPS 6 & 7 — self-filtering against the shared route-permission map.
          Carries its own stagger group (see QuickLinksGrid). */}
      <QuickLinksGrid campaignId={campaignId} userId={userId} />
    </div>
  );
}

import { requirePermission } from "@/lib/permissions";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";
import {
  formatRate,
  getCampaignStatistics,
} from "@/lib/campaign-statistics";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";
import { CommitteeAcceptanceTable } from "./CommitteeAcceptanceTable";
import { CommitteeBarChart } from "./CommitteeBarChart";
import { MetricCard } from "./MetricCard";
import { Phase1OutcomeBreakdown } from "./Phase1OutcomeBreakdown";
import {
  RejectionDonutChart,
  type RejectionSlice,
} from "./RejectionDonutChart";

// Campaign statistics. Gated as a whole by VIEW_STATISTICS via the shared
// route-permission map — there is no partially-visible version of this page, so
// it uses requirePermission rather than per-section gates.
//
// Every figure comes from campaign-statistics.ts, which the dashboard's
// pipeline funnel reads from as well. That is deliberate: the funnel's
// "Shortlisted" bar and this page's Phase 1 pass rate are the same count seen
// two ways, and a second query here could quietly disagree with it.
export default async function StatisticsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  await requirePermission(CAMPAIGN_PAGE_PERMISSIONS["statistics"], {
    redirectTo: `/campaigns/${campaignId}/dashboard?denied=1`,
  });

  const stats = await getCampaignStatistics(campaignId);

  // Ordered earliest exit → latest, which is the order the ramp's lightness
  // steps encode. Reordering these would break that reading.
  const rejectionSlices: RejectionSlice[] = [
    {
      key: "non-issatso",
      label: "Not an ISSATSO Student",
      hint: "Auto-rejected on import; never entered scoring.",
      count: stats.autoRejectedNonIssatso,
      color: "--chart-reject-1",
    },
    {
      key: "phase1-score",
      label: "Phase 1 Score",
      hint: "Scored, then rejected on the screening rubric.",
      count: stats.phase1ScoreRejected,
      color: "--chart-reject-2",
    },
    {
      key: "final-stage",
      label: "Final Stage",
      hint: "Interviewed, then turned down at the decision meeting.",
      count: stats.finalStageRejected,
      color: "--chart-reject-3",
    },
  ];

  const enteredScoring = stats.totalApplicants - stats.autoRejectedNonIssatso;
  const finalVerdicts = stats.accepted + stats.finalStageRejected;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Statistics
        </h1>
        <p className="mt-1 text-base text-neutral-500 dark:text-neutral-400">
          Recruitment numbers for this campaign, counted live on every load.
        </p>
      </header>

      {/* STEP 3 — the three headline figures. Each card's third line names the
          denominator, so a rate can't be misread as a share of the whole pool. */}
      <StaggerGroup className="grid gap-6 md:grid-cols-3">
        <StaggerItem>
          <MetricCard
            icon="groups"
            tone="primary"
            label="Total Applicants"
            value={String(stats.totalApplicants)}
            context="Every application in this campaign."
          />
        </StaggerItem>
        <StaggerItem>
          <MetricCard
            icon="verified"
            tone="accepted"
            label="Phase 1 Pass Rate"
            value={formatRate(stats.phase1PassRate)}
            context={`${enteredScoring} entered scoring — non-ISSATSO auto-rejects excluded.`}
          />
        </StaggerItem>
        <StaggerItem>
          <MetricCard
            icon="how_to_reg"
            tone="primary"
            label="Final Acceptance Rate"
            value={formatRate(stats.finalAcceptanceRate)}
            context={`${stats.accepted} accepted of ${finalVerdicts} who reached a final verdict.`}
          />
        </StaggerItem>
      </StaggerGroup>

      {/* STEPS 4 & 5 — side by side, because the whole point of the pair is
          comparing them: same three categories, deliberately different totals. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CommitteeBarChart
          data={stats.applicantsByPreferredCommittee}
          title="Applicants per Preferred Committee"
          caption="The committee each applicant asked for on the form — everyone in the pool, whatever became of them."
        />
        <CommitteeBarChart
          data={stats.applicantsByAssignedCommittee}
          title="Applicants per Assigned Committee"
          caption="Only accepted applicants carry an assigned committee, so this total is smaller than the chart beside it by design — it is the intake, not the applications."
          emptyMessage="Nobody has been accepted into a committee yet."
        />
      </div>

      {/* STEPS 6 & 7 — the donut is a compact three-slice figure, so it takes a
          third and the outcome bars take the rest rather than each being
          stretched to a column it doesn't fill. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <RejectionDonutChart slices={rejectionSlices} />
        <div className="lg:col-span-2">
          <Phase1OutcomeBreakdown counts={stats.phase1OutcomeBreakdown} />
        </div>
      </div>

      {/* STEP 8 — full width: five columns need the room, and the committee
          names wrap badly in a half-width card. */}
      <CommitteeAcceptanceTable campaignId={campaignId} />
    </div>
  );
}

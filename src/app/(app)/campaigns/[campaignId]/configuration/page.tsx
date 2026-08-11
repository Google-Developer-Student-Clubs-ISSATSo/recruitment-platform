import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import { PermissionGate } from "@/components/permission-gate";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";
import { CampaignLeadsSection } from "./CampaignLeadsSection";
import { CapacityConfigSection } from "./CapacityConfigSection";
import { InterviewConfigSection } from "./InterviewConfigSection";
import { FinalEmailLinksSection } from "./FinalEmailLinksSection";
import { ScoringConfigSection } from "./ScoringConfigSection";
import { MktSkillsConfigSection } from "./MktSkillsConfigSection";
import { Phase2VisibilitySection } from "./Phase2VisibilitySection";

// Per-campaign Configuration. Composes independent sections, each gated by its
// own permission via <PermissionGate>. Adding a third configuration area later
// is just: write the component and wrap it in one more <PermissionGate> line.
//
// This page is NOT gated as a whole (no requirePermission): a user reaching it
// with none of the configuration permissions — e.g. via a direct URL, since the
// nav link is hidden for them — sees a clear empty state rather than a blank
// page or a redirect. Settings here are scoped to the campaign in the route.
export default async function ConfigurationPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // Used only to decide whether to show the empty state. The sections
  // themselves re-check via PermissionGate; hasPermission is request-cached, so
  // this adds no extra queries.
  const [canCapacity, canScreening, canSendEmails, canManageAccounts] = await Promise.all([
    hasPermission(userId, PermissionKey.MANAGE_CAPACITY),
    hasPermission(userId, PermissionKey.CONFIGURE_SCREENING),
    hasPermission(userId, PermissionKey.SEND_EMAILS),
    hasPermission(userId, PermissionKey.MANAGE_ACCOUNTS),
  ]);
  const hasAnyConfigAccess =
    canCapacity || canScreening || canSendEmails || canManageAccounts;

  return (
    // Widened from max-w-3xl to match the activity log and the Stitch reference's
    // 1440px content area: the scoring section is a two-column bento grid whose
    // lg: breakpoint never fires inside a 768px container, and whose question rows
    // carry ~400px of fixed columns before the question text gets any room.
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Configuration</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Settings for this campaign. You only see the sections your permissions
          allow.
        </p>
      </div>

      {hasAnyConfigAccess ? (
        <StaggerGroup className="space-y-6">
          <StaggerItem>
            <PermissionGate permission={PermissionKey.MANAGE_CAPACITY}>
              <CapacityConfigSection campaignId={campaignId} />
            </PermissionGate>
          </StaggerItem>

          <StaggerItem>
            <PermissionGate permission={PermissionKey.MANAGE_CAPACITY}>
              <InterviewConfigSection campaignId={campaignId} />
            </PermissionGate>
          </StaggerItem>

          <StaggerItem>
            <PermissionGate permission={PermissionKey.SEND_EMAILS}>
              <FinalEmailLinksSection campaignId={campaignId} />
            </PermissionGate>
          </StaggerItem>

          <StaggerItem>
            <PermissionGate permission={PermissionKey.CONFIGURE_SCREENING}>
              <ScoringConfigSection campaignId={campaignId} />
            </PermissionGate>
          </StaggerItem>

          <StaggerItem>
            <PermissionGate permission={PermissionKey.CONFIGURE_SCREENING}>
              <MktSkillsConfigSection campaignId={campaignId} />
            </PermissionGate>
          </StaggerItem>

          <StaggerItem>
            <PermissionGate permission={PermissionKey.MANAGE_ACCOUNTS}>
              <Phase2VisibilitySection campaignId={campaignId} />
            </PermissionGate>
          </StaggerItem>

          <StaggerItem>
            <PermissionGate permission={PermissionKey.MANAGE_ACCOUNTS}>
              <CampaignLeadsSection campaignId={campaignId} />
            </PermissionGate>
          </StaggerItem>
        </StaggerGroup>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm font-medium text-foreground">
            No configuration options available for your account.
          </p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Configuration is managed by users with the relevant permissions. If
            you believe this is a mistake, contact a TM Lead.
          </p>
        </div>
      )}
    </div>
  );
}

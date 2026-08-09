import { Icon } from "@/components/app-shell/icon";
import { prisma } from "@/lib/prisma";
import {
  getCampaignLeadHolders,
  isEligibleForLeadRole,
  LEAD_ROLES,
  LEAD_ROLE_COMMITTEE,
  LEAD_ROLE_LABELS,
} from "@/lib/campaign-leads";
import { RoleTemplateName } from "@/generated/prisma/enums";
import type { LeadRole } from "@/generated/prisma/enums";
import { LeadAssignmentForm } from "./leads/LeadAssignmentForm";

// Server data-loader for the four appointable campaign lead titles. Rendered
// only for MANAGE_ACCOUNTS holders (the <PermissionGate> in page.tsx); the
// assign action re-checks that permission itself.
//
// Each role gets its OWN option list, narrowed by LEAD_ROLE_COMMITTEE: MKT and
// EER Lead offer only that committee's members, Club and Technical Lead offer
// everyone. The TM Lead is dropped from every list (they're already the
// campaign's Administrator, see isTmLeadUser), and anyone already holding a
// DIFFERENT lead role on this campaign is dropped from the others' lists
// (one title per campaign). The narrowing here is presentation — `assignLead`
// re-checks both rules server-side, since these options travel to a client
// component.
export async function CampaignLeadsSection({
  campaignId,
}: {
  campaignId: string;
}) {
  const [holders, users] = await Promise.all([
    getCampaignLeadHolders(campaignId),
    prisma.user.findMany({
      where: { roleTemplate: { isNot: { name: RoleTemplateName.TM_LEAD } } },
      select: { id: true, name: true, email: true, committee: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const heldRoleByUserId = new Map(
    LEAD_ROLES.filter((role) => holders[role]).map((role) => [
      holders[role]!.userId,
      role,
    ]),
  );

  const optionsFor = (role: LeadRole) =>
    users
      .filter((u) => isEligibleForLeadRole(role, u.committee))
      .filter((u) => {
        const heldRole = heldRoleByUserId.get(u.id);
        return heldRole === undefined || heldRole === role;
      })
      .map((u) => ({ id: u.id, label: u.name ?? u.email }));

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="emoji_events" className="text-[22px]" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Campaign Leads
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Appoint the MKT, EER, Club, and Technical Lead for this campaign.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {LEAD_ROLES.map((role) => (
          <LeadAssignmentForm
            key={role}
            campaignId={campaignId}
            role={role}
            roleLabel={LEAD_ROLE_LABELS[role]}
            currentHolder={holders[role]}
            memberOptions={optionsFor(role)}
            requiredCommittee={LEAD_ROLE_COMMITTEE[role]}
          />
        ))}
      </div>
    </section>
  );
}

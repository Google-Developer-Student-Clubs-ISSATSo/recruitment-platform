import type { LeadRole } from "@/generated/prisma/enums";
import { LEAD_ROLE_LABELS } from "@/lib/campaign-leads";

/**
 * The role label someone should be introduced by, and whether it's still
 * meaningful to ask "did their permissions drift from this?".
 *
 * A held CampaignLead title is a fixed identity — MKT Lead, EER Lead, Club
 * Lead, or Technical Lead — not a permission-set default anyone drifts away
 * from, so `isTemplateDerived` is false whenever one applies: the caller
 * should never append a RoleTemplate-drift "Custom" suffix to it, and
 * toggling a permission must never change this label.
 */
export type PrimaryRole = {
  label: string;
  isTemplateDerived: boolean;
};

/**
 * Resolve the primary role display everywhere a user's role renders (Admin
 * Settings table, navbar subtitle): a held Lead title wins over the
 * RoleTemplate label, exactly like a Lead title already wins over committee
 * colour in identity-color.ts. `leadRoles` is scoped by the caller — see
 * identity-color-store.ts for the same campaign/global scoping rules.
 *
 * One member can hold only one lead title per campaign, but this can be
 * called with roles gathered across every open campaign (the navbar, Admin
 * Settings), so `leadRoles` could in theory carry more than one entry — the
 * first is taken, same tie-break as resolveIdentityColor.
 */
export function resolvePrimaryRole({
  templateLabel,
  leadRoles = [],
}: {
  templateLabel: string;
  leadRoles?: readonly LeadRole[];
}): PrimaryRole {
  const [leadRole] = leadRoles;
  if (leadRole) {
    return { label: LEAD_ROLE_LABELS[leadRole], isTemplateDerived: false };
  }
  return { label: templateLabel, isTemplateDerived: true };
}

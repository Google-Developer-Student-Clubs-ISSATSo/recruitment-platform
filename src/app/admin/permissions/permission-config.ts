import { Committee, PermissionKey, RoleTemplateName } from "@/generated/prisma/enums";
import type { IdentityColor } from "@/lib/identity-color";

/** All committees, in display order. */
export const COMMITTEES: Committee[] = [
  Committee.MKT,
  Committee.TM,
  Committee.EER,
];

export type PermissionCategory = {
  title: string;
  permissions: PermissionKey[];
};

/**
 * Every PermissionKey, grouped into sensible categories for the toggle UI.
 * All permissions are plain global flags — committee scoping comes from each
 * user's own home committee, not from the permission itself.
 */
export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    title: "Screening",
    permissions: [
      PermissionKey.VIEW_FULL_POOL,
      PermissionKey.CONFIGURE_SCREENING,
      PermissionKey.SCREEN_PHASE1,
      PermissionKey.ENTER_TECHNICAL_SCORE,
      PermissionKey.IMPORT_APPLICANTS,
      PermissionKey.VIEW_MKT_SKILLS_BREAKDOWN,
    ],
  },
  {
    title: "Interviews",
    permissions: [
      PermissionKey.ENTER_INTERVIEW_SLOT,
      PermissionKey.CLAIM_PANEL_SEAT,
      PermissionKey.EDIT_OWN_INTERVIEW_NOTES,
    ],
  },
  {
    title: "Decisions",
    permissions: [PermissionKey.ENTER_FINAL_DECISION],
  },
  {
    title: "Admin",
    permissions: [
      PermissionKey.MANAGE_CAPACITY,
      PermissionKey.MANAGE_ACCOUNTS,
      PermissionKey.MANAGE_CAMPAIGNS,
      PermissionKey.SEND_EMAILS,
      PermissionKey.VIEW_CAMPAIGN_HISTORY,
      PermissionKey.VIEW_ACTIVITY_LOG,
    ],
  },
];

/**
 * What each permission actually lets someone do, in one plain sentence — the
 * single source of truth for the descriptions shown under every toggle in the
 * Permission Management screen.
 *
 * Typed as a full `Record<PermissionKey, string>` on purpose, NOT a Partial: a
 * new key added to the enum fails to compile until it is described here, so no
 * permission can ship into the admin UI undocumented.
 *
 * It lives here rather than next to `lib/permissions.ts` because this file is
 * the permission UI's metadata module (categories, labels, consequence set) and
 * is safe to import from client components — `lib/permissions.ts` pulls in
 * Prisma and auth, which a client toggle cannot.
 */
export const PERMISSION_DEFINITIONS: Record<PermissionKey, string> = {
  [PermissionKey.VIEW_FULL_POOL]:
    "See every applicant in the campaign and read their complete application answers.",
  [PermissionKey.CONFIGURE_SCREENING]:
    "Add, edit and re-weight the Phase 1 scoring questions everyone else screens against.",
  [PermissionKey.SCREEN_PHASE1]:
    "Score applications on the Phase 1 rubric and run the selection that shortlists or rejects them.",
  [PermissionKey.ENTER_TECHNICAL_SCORE]:
    "Score only the Technical Skills question, on a restricted view of the scoring queue.",
  [PermissionKey.ENTER_INTERVIEW_SLOT]:
    "Record the date, time and room each shortlisted applicant booked for their interview.",
  [PermissionKey.CLAIM_PANEL_SEAT]:
    "Take or release a committee seat on an applicant's interview panel — this is what puts someone on a panel.",
  [PermissionKey.EDIT_OWN_INTERVIEW_NOTES]:
    "Read and write the interview note for applicants whose panel they sit on, and no one else's.",
  [PermissionKey.ENTER_FINAL_DECISION]:
    "Open the final-decision dashboard and record each applicant's accept or reject outcome.",
  [PermissionKey.MANAGE_CAPACITY]:
    "Set how many seats each committee is recruiting for in this campaign.",
  [PermissionKey.IMPORT_APPLICANTS]:
    "Upload the application CSV and commit the imported applicants into a campaign.",
  [PermissionKey.MANAGE_ACCOUNTS]:
    "Full administrative control: create and delete members, change anyone's permissions, and view, edit or reopen any interview note.",
  [PermissionKey.MANAGE_CAMPAIGNS]:
    "Create campaigns, and open or close (archive) existing ones.",
  [PermissionKey.SEND_EMAILS]:
    "Send the templated result and interview-booking emails to applicants.",
  [PermissionKey.VIEW_CAMPAIGN_HISTORY]:
    "Open closed, archived campaigns from previous recruitment cycles.",
  [PermissionKey.VIEW_ACTIVITY_LOG]:
    "Read the platform-wide audit trail of every recorded action and who took it.",
  [PermissionKey.VIEW_MKT_SKILLS_BREAKDOWN]:
    "See the Phase 2 MKT Skills Breakdown — which applicants listed which whitelisted MKT skills.",
};

/** Human-friendly names for the role templates. */
export const ROLE_TEMPLATE_LABELS: Record<RoleTemplateName, string> = {
  [RoleTemplateName.TM_REVIEWER]: "TM Reviewer",
  [RoleTemplateName.TECHNICAL_SCORER]: "Technical Scorer",
  [RoleTemplateName.COMMITTEE_REPRESENTATIVE]: "Committee Rep",
  [RoleTemplateName.TM_LEAD]: "TM Lead",
};

/**
 * The role template a member's home committee implies. TM's lead IS the
 * Administrator (see LEAD_ROLE_COMMITTEE in lib/campaign-leads.ts), so an
 * ordinary TM member's standing role is the reviewer template; MKT and EER
 * members are committee representatives. This is the only rule creating a new
 * member is allowed to apply — TECHNICAL_SCORER and TM_LEAD are reachable only
 * via Technical Lead assignment and the Transfer Admin Role flow respectively,
 * never at account creation.
 */
export function roleTemplateForCommittee(committee: Committee): RoleTemplateName {
  return committee === Committee.TM
    ? RoleTemplateName.TM_REVIEWER
    : RoleTemplateName.COMMITTEE_REPRESENTATIVE;
}

/**
 * High-consequence permissions. Toggling any of these OFF is hard to undo or
 * has broad reach, so it must be confirmed before it takes effect (STEP 5).
 */
export const HIGH_CONSEQUENCE_PERMISSIONS: ReadonlySet<PermissionKey> = new Set([
  PermissionKey.MANAGE_ACCOUNTS,
  PermissionKey.ENTER_FINAL_DECISION,
  PermissionKey.CONFIGURE_SCREENING,
  PermissionKey.VIEW_ACTIVITY_LOG,
]);

/** A serialisable user row passed from the server page to the client table. */
export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  /** Every user has exactly one home committee. */
  committee: Committee;
  /** The role template this user was originally assigned (their OWN template). */
  templateName: RoleTemplateName;
  /** Human-friendly label for {@link templateName}. */
  templateLabel: string;
  /**
   * True when the user's current permission set deviates from their assigned
   * template. Feeds {@link primaryRoleIsCustom} below rather than the badge
   * directly — see that field for why.
   */
  isCustom: boolean;
  /** Plain global permission flags this user holds. */
  permissions: PermissionKey[];
  /**
   * The colour this member is drawn in — avatar and both badges. Resolved once
   * on the server (see lib/identity-color.ts) so the row can't compute it two
   * different ways for the same person.
   */
  identityColor: IdentityColor;
  /**
   * What the role badge reads — a held Lead title if any, else
   * {@link templateLabel}. Resolved once on the server (see
   * lib/primary-role.ts), same reasoning as identityColor above.
   */
  primaryRoleLabel: string;
  /**
   * Whether {@link primaryRoleLabel} may still show the "Custom" suffix. False
   * whenever a Lead title is the source of the label (a Lead title cannot
   * drift — see lib/primary-role.ts); otherwise mirrors {@link isCustom}.
   */
  primaryRoleIsCustom: boolean;
};

export type TemplateOption = { name: RoleTemplateName; label: string };

/** "ENTER_FINAL_DECISION" -> "Enter Final Decision" */
export function humanizePermission(permission: string): string {
  return permission
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

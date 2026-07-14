import { Committee, PermissionKey, RoleTemplateName } from "@/generated/prisma/enums";

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
    permissions: [
      PermissionKey.VIEW_COMMITTEE_DASHBOARD,
      PermissionKey.ENTER_FINAL_DECISION,
    ],
  },
  {
    title: "Admin",
    permissions: [
      PermissionKey.MANAGE_CAPACITY,
      PermissionKey.MANAGE_ACCOUNTS,
      PermissionKey.MANAGE_CAMPAIGNS,
      PermissionKey.SEND_EMAILS,
      PermissionKey.VIEW_CAMPAIGN_HISTORY,
      PermissionKey.VIEW_STATISTICS,
      PermissionKey.VIEW_ACTIVITY_LOG,
    ],
  },
];

/** Human-friendly names for the role templates. */
export const ROLE_TEMPLATE_LABELS: Record<RoleTemplateName, string> = {
  [RoleTemplateName.TM_REVIEWER]: "TM Reviewer",
  [RoleTemplateName.TECHNICAL_SCORER]: "Technical Scorer",
  [RoleTemplateName.COMMITTEE_REPRESENTATIVE]: "Committee Representative",
  [RoleTemplateName.TM_LEAD]: "TM Lead",
};

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
   * template — the badge then reads "{templateLabel} Custom".
   */
  isCustom: boolean;
  /** Plain global permission flags this user holds. */
  permissions: PermissionKey[];
};

export type TemplateOption = { name: RoleTemplateName; label: string };

/** A PENDING UserInvite shown alongside active members in the admin list. */
export type PendingInviteRow = {
  id: string;
  name: string;
  email: string;
  committee: Committee;
  templateLabel: string;
  createdAtISO: string;
};

/** "ENTER_FINAL_DECISION" -> "Enter Final Decision" */
export function humanizePermission(permission: string): string {
  return permission
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

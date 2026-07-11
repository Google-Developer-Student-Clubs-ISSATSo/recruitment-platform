import { Committee, PermissionKey, RoleTemplateName } from "@/generated/prisma/enums";

/** All committees, in display order. */
export const COMMITTEES: Committee[] = [
  Committee.MKT,
  Committee.TM,
  Committee.EER,
];

/**
 * Permissions that are granted per-committee. In the UI these render as three
 * separate MKT/TM/EER toggles instead of one; everywhere else they are stored
 * as a null-committee row.
 */
export const COMMITTEE_SCOPED_PERMISSIONS: PermissionKey[] = [
  PermissionKey.VIEW_COMMITTEE_DASHBOARD,
  PermissionKey.ENTER_FINAL_DECISION,
];

export function isCommitteeScoped(permission: PermissionKey): boolean {
  return COMMITTEE_SCOPED_PERMISSIONS.includes(permission);
}

export type PermissionCategory = {
  title: string;
  permissions: PermissionKey[];
};

/** Every PermissionKey, grouped into sensible categories for the toggle UI. */
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
      PermissionKey.MANAGE_CAPACITY,
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
  [RoleTemplateName.INTERVIEWER]: "Interviewer",
  [RoleTemplateName.TM_REVIEWER]: "TM Reviewer",
  [RoleTemplateName.TECHNICAL_SCORER]: "Technical Scorer",
  [RoleTemplateName.COMMITTEE_REPRESENTATIVE]: "Committee Rep",
  [RoleTemplateName.TM_LEAD]: "TM Lead",
};

export type UserPermissionLite = {
  permission: PermissionKey;
  committee: Committee | null;
};

/** A serialisable user row passed from the server page to the client table. */
export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  /** Template name if the permission set matches one exactly, else "Custom". */
  badgeLabel: string;
  isExactTemplate: boolean;
  /** Best-overlap template, used by "Reset to template defaults". */
  closestTemplate: RoleTemplateName;
  committees: Committee[];
  permissions: UserPermissionLite[];
};

export type TemplateOption = { name: RoleTemplateName; label: string };

/** "ENTER_FINAL_DECISION" -> "Enter Final Decision" */
export function humanizePermission(permission: string): string {
  return permission
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

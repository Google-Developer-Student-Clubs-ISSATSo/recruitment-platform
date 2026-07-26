-- Drop VIEW_COMMITTEE_DASHBOARD and VIEW_STATISTICS from PermissionKey.
--
-- VIEW_COMMITTEE_DASHBOARD has no remaining job: the final-decision dashboard is
-- gated purely by ENTER_FINAL_DECISION, and interview-note visibility is now
-- panel-seat + TM Lead only (the close/reopen workflow replaced the read-only
-- committee preview it used to grant).
--
-- VIEW_STATISTICS is gone because the Statistics page is open to every
-- authenticated member — there is nothing left for the flag to gate.
--
-- Postgres cannot drop a label from an enum in place, and the USING cast below
-- fails outright on any surviving row that still holds one of the two labels.
-- Existing databases DO have such rows (every Committee Rep was granted
-- VIEW_COMMITTEE_DASHBOARD, and the TM Lead template holds every key), so the
-- rows are deleted first rather than left to break the type swap. Deleting them
-- is safe and non-destructive in effect: the permissions they encode no longer
-- change any access decision in the app.

DELETE FROM "UserPermission"
WHERE "permission" IN ('VIEW_COMMITTEE_DASHBOARD', 'VIEW_STATISTICS');

DELETE FROM "RoleTemplatePermission"
WHERE "permission" IN ('VIEW_COMMITTEE_DASHBOARD', 'VIEW_STATISTICS');

-- Swap the enum type for one without the two labels.
ALTER TYPE "PermissionKey" RENAME TO "PermissionKey_old";

CREATE TYPE "PermissionKey" AS ENUM (
  'VIEW_FULL_POOL',
  'CONFIGURE_SCREENING',
  'SCREEN_PHASE1',
  'ENTER_TECHNICAL_SCORE',
  'ENTER_INTERVIEW_SLOT',
  'CLAIM_PANEL_SEAT',
  'EDIT_OWN_INTERVIEW_NOTES',
  'ENTER_FINAL_DECISION',
  'MANAGE_CAPACITY',
  'IMPORT_APPLICANTS',
  'MANAGE_ACCOUNTS',
  'MANAGE_CAMPAIGNS',
  'SEND_EMAILS',
  'VIEW_CAMPAIGN_HISTORY',
  'VIEW_ACTIVITY_LOG'
);

ALTER TABLE "UserPermission"
  ALTER COLUMN "permission" TYPE "PermissionKey"
  USING ("permission"::text::"PermissionKey");

ALTER TABLE "RoleTemplatePermission"
  ALTER COLUMN "permission" TYPE "PermissionKey"
  USING ("permission"::text::"PermissionKey");

DROP TYPE "PermissionKey_old";

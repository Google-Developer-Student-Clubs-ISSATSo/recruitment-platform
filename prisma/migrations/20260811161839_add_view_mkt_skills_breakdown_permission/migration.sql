-- AlterEnum
-- Add the new PermissionKey value only. The RoleTemplatePermission / UserPermission
-- backfill that USES this value lives in the NEXT migration, in its own
-- transaction: Postgres refuses to use a newly-added enum value in the same
-- transaction that added it ("unsafe use of new value ... of enum type"),
-- confirmed against this database before writing this migration.
ALTER TYPE "PermissionKey" ADD VALUE 'VIEW_MKT_SKILLS_BREAKDOWN';

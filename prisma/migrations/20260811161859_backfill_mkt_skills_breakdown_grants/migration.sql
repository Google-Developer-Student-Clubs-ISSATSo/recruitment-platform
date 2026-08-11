-- Backfill VIEW_MKT_SKILLS_BREAKDOWN for the TM Lead template and its current
-- holder(s), preserving the "TM Lead template holds every PermissionKey"
-- invariant this database already maintains (verified before writing this
-- migration: the live RoleTemplatePermission rows for TM_LEAD, and the live
-- Administrator's own UserPermission rows, both already covered all 15
-- pre-existing keys). Runs in its own transaction, after the enum value was
-- committed by the previous migration.
--
-- This is the one-time catch-up for whoever already holds the TM_LEAD
-- template today. It is NOT how the permission stays correct going forward —
-- lib/campaign-leads.ts's AUTO_GRANTED_PERMISSION auto-grants it to whoever
-- is assigned MKT Lead from here on, and a future Transfer Admin Role accept
-- reads it straight from RoleTemplatePermission (see
-- admin/transfer-admin/actions.ts), so the incoming Administrator gets it too
-- without another migration.

-- 1. RoleTemplatePermission: add the row for TM_LEAD, so any future
--    "reset to template defaults" or admin transfer includes this key.
INSERT INTO "RoleTemplatePermission" ("id", "roleTemplateId", "permission")
SELECT gen_random_uuid()::text, rt.id, 'VIEW_MKT_SKILLS_BREAKDOWN'
FROM "RoleTemplate" rt
WHERE rt.name = 'TM_LEAD'
ON CONFLICT DO NOTHING;

-- 2. UserPermission: grant it directly to whoever currently holds the
--    TM_LEAD template. Source MANUAL, matching every other permission row
--    the Administrator already holds (all pre-existing grants for this user
--    are source MANUAL, not LEAD_ROLE — this one is no different: it was not
--    granted via a CampaignLead assignment, so LEAD_ROLE would misattribute
--    where it came from and would make it eligible for the auto-revoke path
--    in assignCampaignLead, which must never apply to the Administrator).
INSERT INTO "UserPermission" ("id", "userId", "permission", "source", "grantedAt")
SELECT gen_random_uuid()::text, u.id, 'VIEW_MKT_SKILLS_BREAKDOWN', 'MANUAL', CURRENT_TIMESTAMP
FROM "User" u
JOIN "RoleTemplate" rt ON u."roleTemplateId" = rt.id
WHERE rt.name = 'TM_LEAD'
ON CONFLICT DO NOTHING;

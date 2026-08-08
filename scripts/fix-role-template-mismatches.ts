import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { RoleTemplateName } from "../src/generated/prisma/enums";
import { syncPermissionsToTemplate } from "../src/lib/role-template-sync";

/**
 * One-time data correction, run manually — not wired into any deploy step and
 * not a general reconciliation job.
 *
 * Investigation (2026-08-08) found two members whose stored roleTemplateId
 * didn't match "TM committee -> TM_REVIEWER, MKT/EER committee ->
 * COMMITTEE_REPRESENTATIVE": Mehdi Ayari (TM, was COMMITTEE_REPRESENTATIVE)
 * and Nour Gharbi (EER, was TM_REVIEWER). This fixes exactly those two,
 * hardcoded by email so it can't silently drift into "fixing" someone whose
 * committee changes for a legitimate reason. Re-running it once applied is a
 * no-op — both checks below become false and nothing is touched.
 */
const CORRECTIONS: { email: string; expected: RoleTemplateName }[] = [
  { email: "mehdi@gdgc-issatso.dev", expected: RoleTemplateName.TM_REVIEWER },
  { email: "nour@gdgc-issatso.dev", expected: RoleTemplateName.COMMITTEE_REPRESENTATIVE },
];

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const admin = await prisma.user.findFirst({
    where: { roleTemplate: { name: RoleTemplateName.TM_LEAD } },
    select: { id: true },
  });
  if (!admin) {
    throw new Error("No Administrator (TM_LEAD) in the database — cannot attribute this correction.");
  }

  for (const { email, expected } of CORRECTIONS) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, roleTemplate: { select: { id: true, name: true } } },
    });
    if (!user) {
      console.log(`SKIP  ${email}: no such user.`);
      continue;
    }
    if (user.roleTemplate?.name === expected) {
      console.log(`SKIP  ${email}: already ${expected}.`);
      continue;
    }

    const previousTemplate = user.roleTemplate?.name ?? null;
    const template = await prisma.roleTemplate.findUnique({
      where: { name: expected },
      select: { id: true },
    });
    if (!template) throw new Error(`Role template ${expected} not found.`);

    await prisma.user.update({
      where: { id: user.id },
      data: { roleTemplateId: template.id },
    });

    // Reuses the exact permission-sync the "Reset to template" admin action
    // runs, so a manually-corrected roleTemplateId ends up in the identical
    // UserPermission state a fresh assignment to that template would produce.
    const syncedTo = await syncPermissionsToTemplate(user.id, admin.id);

    await prisma.activityLogEntry.create({
      data: {
        actorId: admin.id,
        actionType: "USER_ROLE_TEMPLATE_CORRECTED",
        targetType: "User",
        targetId: user.id,
        details: {
          email,
          previousRoleTemplate: previousTemplate,
          roleTemplate: syncedTo,
          reason: "one-time correction: roleTemplateId did not match the committee -> template rule",
        },
      },
    });

    console.log(`FIXED ${email}: ${previousTemplate} -> ${syncedTo}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

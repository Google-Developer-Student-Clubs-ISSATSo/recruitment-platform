import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { Committee, PermissionKey } from "@/generated/prisma/enums";

async function userIdFor(email: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) throw new Error(`Seed user not found: ${email} — run the seed.`);
  return user.id;
}

type Case = {
  label: string;
  expect: boolean;
  run: () => Promise<boolean>;
};

async function main() {
  // Seed identities (see prisma/seed.ts).
  const ons = await userIdFor("krifaaziz04@gmail.com"); // TM_LEAD ("Ons" / One El Maleh)
  const lina = await userIdFor("lina@gdgc-issatso.dev"); // COMMITTEE_REPRESENTATIVE, MKT-scoped
  const karim = await userIdFor("karim@gdgc-issatso.dev"); // INTERVIEWER
  const yassine = await userIdFor("yassine@gdgc-issatso.dev"); // TM_REVIEWER
  const sami = await userIdFor("sami@gdgc-issatso.dev"); // TECHNICAL_SCORER

  const cases: Case[] = [
    {
      label: "Ons (TM Lead) ENTER_FINAL_DECISION @ MKT",
      expect: true,
      run: () => hasPermission(ons, PermissionKey.ENTER_FINAL_DECISION, Committee.MKT),
    },
    {
      label: "Ons (TM Lead) ENTER_FINAL_DECISION @ TM",
      expect: true,
      run: () => hasPermission(ons, PermissionKey.ENTER_FINAL_DECISION, Committee.TM),
    },
    {
      label: "Ons (TM Lead) ENTER_FINAL_DECISION @ EER",
      expect: true,
      run: () => hasPermission(ons, PermissionKey.ENTER_FINAL_DECISION, Committee.EER),
    },
    {
      label: "Lina (Committee Rep, MKT) VIEW_COMMITTEE_DASHBOARD @ MKT",
      expect: true,
      run: () => hasPermission(lina, PermissionKey.VIEW_COMMITTEE_DASHBOARD, Committee.MKT),
    },
    {
      label: "Lina (Committee Rep, MKT) VIEW_COMMITTEE_DASHBOARD @ TM (no wildcard)",
      expect: false,
      run: () => hasPermission(lina, PermissionKey.VIEW_COMMITTEE_DASHBOARD, Committee.TM),
    },
    {
      label: "Karim (Interviewer) SCREEN_PHASE1",
      expect: false,
      run: () => hasPermission(karim, PermissionKey.SCREEN_PHASE1),
    },
    {
      label: "Yassine (TM Reviewer) SCREEN_PHASE1 @ TM (committee-scoped)",
      expect: false,
      run: () => hasPermission(yassine, PermissionKey.SCREEN_PHASE1, Committee.TM),
    },
    {
      label: "Yassine (TM Reviewer) SCREEN_PHASE1 (no committee / global)",
      expect: true,
      run: () => hasPermission(yassine, PermissionKey.SCREEN_PHASE1),
    },
    {
      label: "Sami (Technical Scorer) ENTER_TECHNICAL_SCORE",
      expect: true,
      run: () => hasPermission(sami, PermissionKey.ENTER_TECHNICAL_SCORE),
    },
    {
      label: "Sami (Technical Scorer) SCREEN_PHASE1",
      expect: false,
      run: () => hasPermission(sami, PermissionKey.SCREEN_PHASE1),
    },
  ];

  let passed = 0;
  for (const c of cases) {
    const got = await c.run();
    const ok = got === c.expect;
    if (ok) passed += 1;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${c.label}  → got ${got}, expected ${c.expect}`,
    );
  }

  console.log(`\n${passed}/${cases.length} checks passed`);
  if (passed !== cases.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

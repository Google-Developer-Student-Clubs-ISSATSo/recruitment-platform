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

async function committeeOf(email: string): Promise<Committee> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { committee: true },
  });
  if (!user) throw new Error(`Seed user not found: ${email} — run the seed.`);
  return user.committee;
}

type Case = {
  label: string;
  expect: boolean;
  run: () => Promise<boolean>;
};

async function main() {
  // Seed identities (see prisma/seed.ts).
  const ons = await userIdFor("krifaaziz04@gmail.com"); // TM_LEAD (Ons El Maleh)
  const lina = await userIdFor("lina@gdgc-issatso.dev"); // COMMITTEE_REPRESENTATIVE, home committee MKT
  const karim = await userIdFor("karim@gdgc-issatso.dev"); // COMMITTEE_REPRESENTATIVE
  const yassine = await userIdFor("yassine@gdgc-issatso.dev"); // TM_REVIEWER
  const sami = await userIdFor("sami@gdgc-issatso.dev"); // TECHNICAL_SCORER

  const cases: Case[] = [
    {
      label: "Ons (TM Lead) ENTER_FINAL_DECISION (global flag)",
      expect: true,
      run: () => hasPermission(ons, PermissionKey.ENTER_FINAL_DECISION),
    },
    {
      label: "Lina (Committee Rep) home committee is MKT",
      expect: true,
      run: async () => (await committeeOf("lina@gdgc-issatso.dev")) === Committee.MKT,
    },
    {
      label: "Lina (Committee Rep) CLAIM_PANEL_SEAT (baseline grant)",
      expect: true,
      run: () => hasPermission(lina, PermissionKey.CLAIM_PANEL_SEAT),
    },
    {
      label: "Lina (Committee Rep) ENTER_FINAL_DECISION (not granted)",
      expect: false,
      run: () => hasPermission(lina, PermissionKey.ENTER_FINAL_DECISION),
    },
    {
      label: "Karim (Committee Rep) SCREEN_PHASE1",
      expect: false,
      run: () => hasPermission(karim, PermissionKey.SCREEN_PHASE1),
    },
    {
      label: "Yassine (TM Reviewer) SCREEN_PHASE1",
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

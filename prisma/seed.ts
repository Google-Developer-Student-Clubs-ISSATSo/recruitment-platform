import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  Committee,
  PermissionKey,
  RoleTemplateName,
} from "../src/generated/prisma/enums";
import { faker } from "@faker-js/faker";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — cannot seed.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Deterministic mock data across runs.
faker.seed(2026);

const ALL_COMMITTEES: Committee[] = [
  Committee.MKT,
  Committee.TM,
  Committee.EER,
];

// Permissions that are meaningful per-committee. For the TM_LEAD these are
// granted as THREE separate rows (one per committee) rather than a single
// null-committee row, so that `committee = null` unambiguously means
// "not committee-specific" and never "all committees".
const COMMITTEE_SCOPED: PermissionKey[] = [
  PermissionKey.VIEW_COMMITTEE_DASHBOARD,
  PermissionKey.ENTER_FINAL_DECISION,
];

// Which PermissionKeys each RoleTemplate grants.
const ROLE_PERMISSIONS: Record<RoleTemplateName, PermissionKey[]> = {
  [RoleTemplateName.INTERVIEWER]: [
    PermissionKey.CLAIM_PANEL_SEAT,
    PermissionKey.EDIT_OWN_INTERVIEW_NOTES,
  ],
  [RoleTemplateName.TM_REVIEWER]: [
    PermissionKey.VIEW_FULL_POOL,
    PermissionKey.SCREEN_PHASE1,
    PermissionKey.ENTER_INTERVIEW_SLOT,
    PermissionKey.CLAIM_PANEL_SEAT,
    PermissionKey.EDIT_OWN_INTERVIEW_NOTES,
  ],
  [RoleTemplateName.TECHNICAL_SCORER]: [PermissionKey.ENTER_TECHNICAL_SCORE],
  [RoleTemplateName.COMMITTEE_REPRESENTATIVE]: [
    PermissionKey.CLAIM_PANEL_SEAT,
    PermissionKey.EDIT_OWN_INTERVIEW_NOTES,
    PermissionKey.VIEW_COMMITTEE_DASHBOARD,
  ],
  // Every PermissionKey value (all 17).
  [RoleTemplateName.TM_LEAD]: Object.values(PermissionKey),
};

type SeedUser = {
  name: string;
  email: string;
  role: RoleTemplateName;
  // Committee that VIEW_COMMITTEE_DASHBOARD is scoped to for this user
  // (COMMITTEE_REPRESENTATIVE only). Ignored for TM_LEAD.
  dashboardCommittee?: Committee;
};

const USERS: SeedUser[] = [
  {
    name: "Med Aziz Krifa",
    email: "krifaaziz80@gmail.com",
    role: RoleTemplateName.INTERVIEWER,
  },
  {
    name: "One El Maleh",
    email: "krifaaziz04@gmail.com",
    role: RoleTemplateName.TM_LEAD,
  },
  {
    name: "Yassine Trabelsi",
    email: "yassine@gdgc-issatso.dev",
    role: RoleTemplateName.TM_REVIEWER,
  },
  {
    name: "Nour Gharbi",
    email: "nour@gdgc-issatso.dev",
    role: RoleTemplateName.TM_REVIEWER,
  },
  {
    name: "Karim Mansour",
    email: "karim@gdgc-issatso.dev",
    role: RoleTemplateName.INTERVIEWER,
  },
  {
    name: "Sami Jaziri",
    email: "sami@gdgc-issatso.dev",
    role: RoleTemplateName.TECHNICAL_SCORER,
  },
  {
    name: "Lina Chaabane",
    email: "lina@gdgc-issatso.dev",
    role: RoleTemplateName.COMMITTEE_REPRESENTATIVE,
    dashboardCommittee: Committee.MKT,
  },
  {
    name: "Mehdi Ayari",
    email: "mehdi@gdgc-issatso.dev",
    role: RoleTemplateName.COMMITTEE_REPRESENTATIVE,
    dashboardCommittee: Committee.TM,
  },
  {
    name: "Rania Ferchichi",
    email: "rania@gdgc-issatso.dev",
    role: RoleTemplateName.COMMITTEE_REPRESENTATIVE,
    dashboardCommittee: Committee.EER,
  },
];

type PermRow = { permission: PermissionKey; committee: Committee | null };

// Expand a user's role template into concrete UserPermission rows.
function buildUserPermissions(user: SeedUser): PermRow[] {
  const rows: PermRow[] = [];

  if (user.role === RoleTemplateName.TM_LEAD) {
    for (const permission of ROLE_PERMISSIONS[RoleTemplateName.TM_LEAD]) {
      if (COMMITTEE_SCOPED.includes(permission)) {
        // One row per committee — never a single null-committee catch-all.
        for (const committee of ALL_COMMITTEES)
          rows.push({ permission, committee });
      } else {
        rows.push({ permission, committee: null });
      }
    }
    return rows;
  }

  for (const permission of ROLE_PERMISSIONS[user.role]) {
    if (
      permission === PermissionKey.VIEW_COMMITTEE_DASHBOARD &&
      user.dashboardCommittee
    ) {
      rows.push({ permission, committee: user.dashboardCommittee });
    } else {
      rows.push({ permission, committee: null });
    }
  }
  return rows;
}

// --- Applicants -----------------------------------------------------------

type SeedApplicant = {
  fullName: string;
  preferredCommittee: Committee;
  isIssatsoStudent: boolean;
};

// 15 applicants: 5 per committee, 13 ISSATSo students + 2 non-students
// (Salma Gharsalli, Wael Bouzid) to exercise the auto-reject-on-import rule.
const APPLICANTS: SeedApplicant[] = [
  {
    fullName: "Firas Belhaj",
    preferredCommittee: Committee.MKT,
    isIssatsoStudent: true,
  },
  {
    fullName: "Emna Khelifi",
    preferredCommittee: Committee.MKT,
    isIssatsoStudent: true,
  },
  {
    fullName: "Oussama Bouazizi",
    preferredCommittee: Committee.MKT,
    isIssatsoStudent: true,
  },
  {
    fullName: "Salma Gharsalli",
    preferredCommittee: Committee.MKT,
    isIssatsoStudent: false,
  },
  {
    fullName: "Aymen Dridi",
    preferredCommittee: Committee.MKT,
    isIssatsoStudent: true,
  },
  {
    fullName: "Ines Hamdi",
    preferredCommittee: Committee.TM,
    isIssatsoStudent: true,
  },
  {
    fullName: "Bilel Zouari",
    preferredCommittee: Committee.TM,
    isIssatsoStudent: true,
  },
  {
    fullName: "Maha Sassi",
    preferredCommittee: Committee.TM,
    isIssatsoStudent: true,
  },
  {
    fullName: "Wael Bouzid",
    preferredCommittee: Committee.TM,
    isIssatsoStudent: false,
  },
  {
    fullName: "Rym Chakroun",
    preferredCommittee: Committee.TM,
    isIssatsoStudent: true,
  },
  {
    fullName: "Nizar Kacem",
    preferredCommittee: Committee.EER,
    isIssatsoStudent: true,
  },
  {
    fullName: "Dorra Mabrouk",
    preferredCommittee: Committee.EER,
    isIssatsoStudent: true,
  },
  {
    fullName: "Hamza Lahmar",
    preferredCommittee: Committee.EER,
    isIssatsoStudent: true,
  },
  {
    fullName: "Sirine Attia",
    preferredCommittee: Committee.EER,
    isIssatsoStudent: true,
  },
  {
    fullName: "Anis Fourati",
    preferredCommittee: Committee.EER,
    isIssatsoStudent: true,
  },
];

function emailFor(fullName: string): string {
  const slug = fullName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .replace(/\s+/g, ".");
  return `${slug}@gmail.com`;
}

async function main() {
  const seedEmails = USERS.map((u) => u.email);

  // Idempotent: clear anything this seed manages, children first.
  await prisma.userPermission.deleteMany({});
  await prisma.roleTemplatePermission.deleteMany({});
  await prisma.applicant.deleteMany({});
  await prisma.campaign.deleteMany({});
  await prisma.roleTemplate.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { in: seedEmails } } });

  // 3a. Role templates + their permissions.
  let roleTemplateCount = 0;
  let roleTemplatePermissionCount = 0;
  for (const name of Object.keys(ROLE_PERMISSIONS) as RoleTemplateName[]) {
    const perms = ROLE_PERMISSIONS[name];
    await prisma.roleTemplate.create({
      data: {
        name,
        permissions: { create: perms.map((permission) => ({ permission })) },
      },
    });
    roleTemplateCount += 1;
    roleTemplatePermissionCount += perms.length;
  }

  // 3b. Users + their concrete UserPermission rows.
  let userCount = 0;
  let userPermissionCount = 0;
  for (const seedUser of USERS) {
    const user = await prisma.user.create({
      data: { name: seedUser.name, email: seedUser.email },
    });
    const rows = buildUserPermissions(seedUser);
    if (rows.length > 0) {
      await prisma.userPermission.createMany({
        data: rows.map((r) => ({
          userId: user.id,
          permission: r.permission,
          committee: r.committee,
        })),
      });
    }
    userCount += 1;
    userPermissionCount += rows.length;
  }

  // 3c. Campaign.
  const campaign = await prisma.campaign.create({
    data: { name: "Recruitment 2026 (Dev Seed)", isOpen: true },
  });

  // 3d. Applicants.
  await prisma.applicant.createMany({
    data: APPLICANTS.map((a) => ({
      campaignId: campaign.id,
      fullName: a.fullName,
      email: emailFor(a.fullName),
      isIssatsoStudent: a.isIssatsoStudent,
      preferredCommittee: a.preferredCommittee,
      rawFormData: {
        hobbies: faker.word.words({ count: { min: 2, max: 4 } }),
        motto: faker.company.catchPhrase(),
      },
    })),
  });

  console.log("Seed complete:");
  console.table({
    RoleTemplate: roleTemplateCount,
    RoleTemplatePermission: roleTemplatePermissionCount,
    User: userCount,
    UserPermission: userPermissionCount,
    Campaign: 1,
    Applicant: APPLICANTS.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

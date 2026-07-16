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

// The Committee Representative baseline — the smallest committee-member bundle.
// Every non-lead template builds on top of it.
const COMMITTEE_REPRESENTATIVE_BASELINE: PermissionKey[] = [
  PermissionKey.CLAIM_PANEL_SEAT,
  PermissionKey.EDIT_OWN_INTERVIEW_NOTES,
  PermissionKey.VIEW_COMMITTEE_DASHBOARD,
];

// Which PermissionKeys each RoleTemplate grants. Permissions are plain global
// flags now — committee scoping comes from each User.committee, never from the
// permission row itself.
const ROLE_PERMISSIONS: Record<RoleTemplateName, PermissionKey[]> = {
  [RoleTemplateName.COMMITTEE_REPRESENTATIVE]: [
    ...COMMITTEE_REPRESENTATIVE_BASELINE,
  ],
  [RoleTemplateName.TM_REVIEWER]: [
    ...COMMITTEE_REPRESENTATIVE_BASELINE,
    PermissionKey.VIEW_FULL_POOL,
    PermissionKey.SCREEN_PHASE1,
    PermissionKey.ENTER_INTERVIEW_SLOT,
  ],
  [RoleTemplateName.TECHNICAL_SCORER]: [
    ...COMMITTEE_REPRESENTATIVE_BASELINE,
    PermissionKey.ENTER_TECHNICAL_SCORE,
  ],
  // Every PermissionKey value, one row each.
  [RoleTemplateName.TM_LEAD]: Object.values(PermissionKey),
};

type SeedUser = {
  name: string;
  email: string;
  role: RoleTemplateName;
  // Every user has exactly one home committee.
  committee: Committee;
};

const USERS: SeedUser[] = [
  {
    name: "Med Aziz Krifa",
    email: "krifaaziz80@gmail.com",
    role: RoleTemplateName.COMMITTEE_REPRESENTATIVE,
    committee: Committee.MKT,
  },
  {
    name: "Ons El Maleh",
    email: "krifaaziz04@gmail.com",
    role: RoleTemplateName.TM_LEAD,
    committee: Committee.TM,
  },
  {
    name: "Yassine Trabelsi",
    email: "yassine@gdgc-issatso.dev",
    role: RoleTemplateName.TM_REVIEWER,
    committee: Committee.TM,
  },
  {
    name: "Nour Gharbi",
    email: "nour@gdgc-issatso.dev",
    role: RoleTemplateName.TM_REVIEWER,
    committee: Committee.EER,
  },
  {
    name: "Karim Mansour",
    email: "karim@gdgc-issatso.dev",
    role: RoleTemplateName.COMMITTEE_REPRESENTATIVE,
    committee: Committee.EER,
  },
  {
    name: "Sami Jaziri",
    email: "sami@gdgc-issatso.dev",
    role: RoleTemplateName.TECHNICAL_SCORER,
    committee: Committee.MKT,
  },
  {
    name: "Lina Chaabane",
    email: "lina@gdgc-issatso.dev",
    role: RoleTemplateName.COMMITTEE_REPRESENTATIVE,
    committee: Committee.MKT,
  },
  {
    name: "Mehdi Ayari",
    email: "mehdi@gdgc-issatso.dev",
    role: RoleTemplateName.COMMITTEE_REPRESENTATIVE,
    committee: Committee.TM,
  },
  {
    name: "Rania Ferchichi",
    email: "rania@gdgc-issatso.dev",
    role: RoleTemplateName.COMMITTEE_REPRESENTATIVE,
    committee: Committee.EER,
  },
];

// Expand a user's role template into concrete UserPermission rows. Permissions
// are plain (userId, permission) flags — no committee column any more.
function buildUserPermissions(user: SeedUser): PermissionKey[] {
  return ROLE_PERMISSIONS[user.role];
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

// A distinct, smaller pool for the archived (closed) campaign — different
// names so scoping to one campaign vs the other is unmistakable.
const ARCHIVED_APPLICANTS: SeedApplicant[] = [
  {
    fullName: "Youssef Trabelsi",
    preferredCommittee: Committee.MKT,
    isIssatsoStudent: true,
  },
  {
    fullName: "Amira Slama",
    preferredCommittee: Committee.TM,
    isIssatsoStudent: true,
  },
  {
    fullName: "Khalil Rekik",
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
  // Drop the User -> RoleTemplate references before deleting templates, or the
  // foreign key would block the delete (any user may still point at one).
  await prisma.user.updateMany({ data: { roleTemplateId: null } });
  await prisma.roleTemplate.deleteMany({});
  // ActivityLogEntry (actor) and AdminTransferInvite (initiator) reference the
  // seed users WITHOUT a cascade, so clear those references first — scoped to
  // just the seed users being recreated — or the user delete hits a foreign-key
  // violation. (Same pattern the deleteUser admin action uses.)
  const staleUsers = await prisma.user.findMany({
    where: { email: { in: seedEmails } },
    select: { id: true },
  });
  const staleUserIds = staleUsers.map((u) => u.id);
  if (staleUserIds.length > 0) {
    await prisma.activityLogEntry.deleteMany({
      where: { actorId: { in: staleUserIds } },
    });
    await prisma.adminTransferInvite.deleteMany({
      where: { initiatedBy: { in: staleUserIds } },
    });
  }
  await prisma.user.deleteMany({ where: { email: { in: seedEmails } } });

  // 3a. Role templates + their permissions.
  let roleTemplateCount = 0;
  let roleTemplatePermissionCount = 0;
  const templateIdByName = {} as Record<RoleTemplateName, string>;
  for (const name of Object.keys(ROLE_PERMISSIONS) as RoleTemplateName[]) {
    const perms = ROLE_PERMISSIONS[name];
    const template = await prisma.roleTemplate.create({
      data: {
        name,
        permissions: { create: perms.map((permission) => ({ permission })) },
      },
    });
    templateIdByName[name] = template.id;
    roleTemplateCount += 1;
    roleTemplatePermissionCount += perms.length;
  }

  // 3b. Users + their concrete UserPermission rows. Every user records the
  // role template they were assigned (roleTemplateId) so the permissions UI
  // can label/reset against their OWN template rather than inferring one.
  let userCount = 0;
  let userPermissionCount = 0;
  for (const seedUser of USERS) {
    const user = await prisma.user.create({
      data: {
        name: seedUser.name,
        email: seedUser.email,
        committee: seedUser.committee,
        roleTemplateId: templateIdByName[seedUser.role],
      },
    });
    const perms = buildUserPermissions(seedUser);
    if (perms.length > 0) {
      await prisma.userPermission.createMany({
        data: perms.map((permission) => ({
          userId: user.id,
          permission,
        })),
      });
    }
    userCount += 1;
    userPermissionCount += perms.length;
  }

  // 3c. Campaigns — one open (the live dev seed) and one CLOSED/archived, so
  // the VIEW_CAMPAIGN_HISTORY gating has something real to test against.
  const campaign = await prisma.campaign.create({
    data: { name: "Recruitment 2026 (Dev Seed)", isOpen: true },
  });
  const archivedCampaign = await prisma.campaign.create({
    data: { name: "Recruitment 2025 (Archived)", isOpen: false },
  });

  // 3d. Applicants for the open campaign.
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

  // A smaller, distinct pool for the archived campaign so entering it clearly
  // shows per-campaign scoping (a different applicant count and roster).
  await prisma.applicant.createMany({
    data: ARCHIVED_APPLICANTS.map((a) => ({
      campaignId: archivedCampaign.id,
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
    Campaign: 2,
    Applicant: APPLICANTS.length + ARCHIVED_APPLICANTS.length,
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

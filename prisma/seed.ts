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

// --- Phase 1 scoring config ------------------------------------------------

type SeedQuestion = {
  text: string;
  coefficient: number;
  noteScale: number[];
  requiresTechnicalScorer?: boolean;
  // Exact CSV/rawFormData header the scored answer is read from. Null for
  // questions with no single form source (reviewer judgment calls).
  sourceField: string | null;
};

// Last year's real Phase 1 rubric (from the product spec). `order` is assigned
// from array position (1-based) and matches the application form's question
// order. Coefficients sum to 100. The default note scale is [0, 0.5, 1]; the
// "Project falling apart scenario" question deliberately uses the wider
// [0, 0.25, 0.5, 0.75, 1] to exercise the configurable-scale feature. The
// "Technical Skills" question is gated to ENTER_TECHNICAL_SCORE holders.
const DEFAULT_NOTE_SCALE = [0, 0.5, 1];
const PHASE_ONE_QUESTIONS: SeedQuestion[] = [
  {
    text: "Why join GDG / intend to learn",
    coefficient: 19,
    noteScale: DEFAULT_NOTE_SCALE,
    sourceField:
      "Why are you interested in joining GDGC specifically, and what do you intend to learn?",
  },
  {
    text: "Team player/leader experience",
    coefficient: 12,
    noteScale: DEFAULT_NOTE_SCALE,
    sourceField:
      "Tell us about an experience where you took the position of a team player or a team leader and how did you manage it?",
  },
  {
    text: "What makes you stand out",
    coefficient: 15,
    noteScale: DEFAULT_NOTE_SCALE,
    sourceField: "What makes you stand out from other candidates?",
  },
  {
    text: "Previous club/community experience",
    coefficient: 5,
    noteScale: DEFAULT_NOTE_SCALE,
    sourceField:
      "Please list any previous experience in clubs and/or communities. (Even little experiences matter)",
  },
  {
    text: "Most significant achievement",
    coefficient: 8,
    noteScale: DEFAULT_NOTE_SCALE,
    sourceField:
      "Tell us about your most significant achievement that you feel proud of ?",
  },
  {
    text: "Project falling apart scenario",
    coefficient: 12,
    noteScale: [0, 0.25, 0.5, 0.75, 1],
    sourceField:
      "You and your team have been working on a project for months but at a certain stage everything starts to fall apart and things do not work in the way you wanted, how would you act and what would you do ?",
  },
  {
    text: "Describe yourself in 3 adjectives",
    coefficient: 3,
    noteScale: DEFAULT_NOTE_SCALE,
    sourceField: "Describe yourself in 3 adjectives:",
  },
  {
    text: "Life motto",
    coefficient: 3,
    noteScale: DEFAULT_NOTE_SCALE,
    sourceField: "What is your life motto. Why you chose it specifically?",
  },
  {
    text: "Big Yes / Big No",
    coefficient: 8,
    noteScale: DEFAULT_NOTE_SCALE,
    sourceField: null,
  },
  {
    text: "Technical Skills",
    coefficient: 15,
    noteScale: DEFAULT_NOTE_SCALE,
    requiresTechnicalScorer: true,
    sourceField: null,
  },
];

// Deliberately small numbers so the auto-classification logic can be tested
// realistically against the 15 seeded applicants later. Real campaigns use
// larger numbers (e.g. 30–40).
const PHASE_ONE_CONFIG = { rejectThreshold: 40, targetCount: 8 };

function emailFor(fullName: string): string {
  const slug = fullName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .replace(/\s+/g, ".");
  return `${slug}@gmail.com`;
}

// Bare alphabetic handle used for the GitHub/LinkedIn URLs.
function handleFor(fullName: string): string {
  return fullName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z]/g, "");
}

/**
 * The applicant's submitted form row, keyed by the EXACT `sourceField` / CSV
 * headers the scoring queue reads each answer from — plus "GitHub link" and
 * "LinkedIn link", which the technical-only view shows as profile links.
 *
 * This is deliberate: an earlier seed wrote only { hobbies, motto }, so NONE of
 * the question source fields were present. The full reviewer view then rendered
 * "No answer found" for every question — which read as "the admin sees no
 * answers", while the technical-only view still showed the always-present name.
 * Populating the real keys here is what makes the full view show actual answers.
 */
function buildRawFormData(fullName: string): Record<string, string> {
  const handle = handleFor(fullName);
  const data: Record<string, string> = {
    "Full name": fullName,
    "GitHub link": `github.com/${handle}`,
    "LinkedIn link": `linkedin.com/in/${handle}`,
  };
  for (const q of PHASE_ONE_QUESTIONS) {
    if (q.sourceField) {
      data[q.sourceField] = faker.lorem.sentences({ min: 1, max: 3 });
    }
  }
  return data;
}

// Snap a raw strength in [0,1] to the nearest allowed note-scale point.
function nearestScalePoint(scale: number[], target: number): number {
  return scale.reduce((best, p) =>
    Math.abs(p - target) < Math.abs(best - target) ? p : best,
  );
}

async function main() {
  const seedEmails = USERS.map((u) => u.email);

  // Idempotent: clear anything this seed manages, children first.
  await prisma.userPermission.deleteMany({});
  await prisma.roleTemplatePermission.deleteMany({});
  // EmailLog references both Applicant and Campaign WITHOUT a cascade (it's an
  // audit trail we never want silently discarded), so it must be cleared before
  // either can be wiped — otherwise a reseed of a DB that has progressed far
  // enough to have sent result emails fails with a foreign-key violation.
  await prisma.emailLog.deleteMany({});
  // Applicant deletes cascade to its Phase 1 scores/results and all interview
  // rows (slots, panels, seats, notes); Campaign deletes cascade to its
  // questions, config and committee capacities.
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
  const userIdByEmail = new Map<string, string>();
  for (const seedUser of USERS) {
    const user = await prisma.user.create({
      data: {
        name: seedUser.name,
        email: seedUser.email,
        committee: seedUser.committee,
        roleTemplateId: templateIdByName[seedUser.role],
      },
    });
    userIdByEmail.set(seedUser.email, user.id);
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
      rawFormData: buildRawFormData(a.fullName),
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
      rawFormData: buildRawFormData(a.fullName),
    })),
  });

  // 3e. Phase 1 scoring rubric + config for the open dev campaign.
  await prisma.phaseOneQuestion.createMany({
    data: PHASE_ONE_QUESTIONS.map((q, i) => ({
      campaignId: campaign.id,
      text: q.text,
      coefficient: q.coefficient,
      noteScale: q.noteScale,
      order: i + 1,
      requiresTechnicalScorer: q.requiresTechnicalScorer ?? false,
      sourceField: q.sourceField,
    })),
  });
  await prisma.phaseOneConfig.create({
    data: {
      campaignId: campaign.id,
      rejectThreshold: PHASE_ONE_CONFIG.rejectThreshold,
      targetCount: PHASE_ONE_CONFIG.targetCount,
    },
  });

  // 3f. Complete Phase 1 scores for every open-campaign applicant, so the
  // scoring queue, ranking and selection pages have real data to work on out of
  // the box (a fresh "Recalculate" then produces a genuine spread rather than a
  // pool of unscored PENDING rows). Each applicant gets a deterministic strength
  // spread from ~0.9 down to ~0.15; every active question is scored to the scale
  // point nearest that strength, so weighted totals span roughly the full range
  // and about ten applicants clear the reject threshold of 40 — enough for the
  // top-8 target to bind with a couple left above the line for human review.
  const createdQuestions = await prisma.phaseOneQuestion.findMany({
    where: { campaignId: campaign.id, isActive: true },
    select: { id: true, noteScale: true },
  });
  const createdApplicants = await prisma.applicant.findMany({
    where: { campaignId: campaign.id },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  const scorerId =
    userIdByEmail.get("krifaaziz04@gmail.com") ?? // Ons El Maleh (TM Lead)
    userIdByEmail.values().next().value!;

  const spread = createdApplicants.length > 1 ? createdApplicants.length - 1 : 1;
  const scoreRows = createdApplicants.flatMap((applicant, i) => {
    const strength = 0.9 - (i * 0.75) / spread;
    return createdQuestions.map((q) => {
      const jittered = Math.min(1, Math.max(0, strength + faker.number.float({ min: -0.1, max: 0.1 })));
      return {
        applicantId: applicant.id,
        questionId: q.id,
        value: nearestScalePoint(q.noteScale, jittered),
        scoredById: scorerId,
      };
    });
  });
  await prisma.phaseOneScore.createMany({ data: scoreRows });

  console.log("Seed complete:");
  console.table({
    RoleTemplate: roleTemplateCount,
    RoleTemplatePermission: roleTemplatePermissionCount,
    User: userCount,
    UserPermission: userPermissionCount,
    Campaign: 2,
    Applicant: APPLICANTS.length + ARCHIVED_APPLICANTS.length,
    PhaseOneQuestion: PHASE_ONE_QUESTIONS.length,
    PhaseOneConfig: 1,
    PhaseOneScore: scoreRows.length,
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

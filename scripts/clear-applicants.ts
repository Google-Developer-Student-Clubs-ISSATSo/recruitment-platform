import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// One-off maintenance: delete every Applicant row for the OPEN dev-seed
// campaign so the CSV can be re-imported into a clean pool. Looked up by name
// (not a hardcoded id, which differs per reseed). PhaseOneScore and
// PhaseOneResult cascade-delete via their onDelete: Cascade relations to
// Applicant — this script verifies that actually happened. It intentionally
// does NOT touch Users, Permissions, PhaseOneQuestion, or PhaseOneConfig.

const CAMPAIGN_NAME = "Recruitment 2026 (Dev Seed)";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — cannot clear applicants.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function countsFor(campaignId: string) {
  const [applicants, scores, results, questions, config] = await Promise.all([
    prisma.applicant.count({ where: { campaignId } }),
    // Scores/results reached via their campaign-scoped relations.
    prisma.phaseOneScore.count({ where: { question: { campaignId } } }),
    prisma.phaseOneResult.count({ where: { applicant: { campaignId } } }),
    prisma.phaseOneQuestion.count({ where: { campaignId } }),
    prisma.phaseOneConfig.count({ where: { campaignId } }),
  ]);
  return { applicants, scores, results, questions, config };
}

async function main() {
  const campaign = await prisma.campaign.findFirst({
    where: { name: CAMPAIGN_NAME, isOpen: true },
    select: { id: true, name: true },
  });
  if (!campaign) {
    throw new Error(
      `No open campaign named "${CAMPAIGN_NAME}" found. Nothing cleared.`,
    );
  }

  const before = await countsFor(campaign.id);
  console.log(`Campaign: "${campaign.name}" (${campaign.id})`);
  console.log("Before:", before);

  // Deleting the applicants cascades to their PhaseOneScore and PhaseOneResult
  // rows. Questions and config are untouched (they hang off the campaign, not
  // the applicant).
  const { count } = await prisma.applicant.deleteMany({
    where: { campaignId: campaign.id },
  });
  console.log(`Deleted ${count} applicant row(s).`);

  const after = await countsFor(campaign.id);
  console.log("After:", after);

  const ok =
    after.applicants === 0 &&
    after.scores === 0 &&
    after.results === 0 &&
    after.questions === before.questions &&
    after.config === before.config;

  if (!ok) {
    throw new Error(
      "Verification FAILED — expected 0 applicants/scores/results and untouched questions/config.",
    );
  }
  console.log(
    `Verified: 0 applicants, 0 scores, 0 results; ${after.questions} question(s) and ${after.config} config row(s) untouched.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

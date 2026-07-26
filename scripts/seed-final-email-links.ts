import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// One-off seed: give the OPEN dev campaign the four external links the final
// result emails interpolate, so the Configuration form and the send batch have
// real destinations on a fresh database. Idempotent — re-running just resets
// them to these values.
//
// These are the club's real, current URLs. They live on the campaign rather
// than in the templates because the acceptance form and Discord invite are
// regenerated each recruitment cycle.

const LINKS = {
  acceptanceFormLink:
    "https://docs.google.com/forms/d/e/1FAIpQLScFp3ipbZ_LNA_WPKRqBDX5VB6lIw3euA0rSXVq_VooW-SBNg/viewform?usp=publish-editor",
  gdgcProgramLink: "https://developers.google.com/community/dsc",
  gdgcPlatformLink:
    "https://gdg.community.dev/gdg-on-campus-higher-institute-of-applied-science-and-technology-sousse-tunisia/",
  discordInviteLink: "https://discord.gg/46WDzCFkBT",
} as const;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — cannot seed final email links.");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const campaign = await prisma.campaign.findFirst({
    where: { isOpen: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });

  if (!campaign) {
    throw new Error("No open campaign found — nothing to seed.");
  }

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: LINKS,
    select: {
      acceptanceFormLink: true,
      gdgcProgramLink: true,
      gdgcPlatformLink: true,
      discordInviteLink: true,
    },
  });

  console.log(`Campaign: ${campaign.name} (${campaign.id})`);
  for (const [key, value] of Object.entries(updated)) {
    console.log(`  ${key.padEnd(19)} ${value}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

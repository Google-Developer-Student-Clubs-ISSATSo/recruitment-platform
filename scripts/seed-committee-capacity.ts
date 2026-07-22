import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Committee } from "../src/generated/prisma/enums";

// One-off seed: give the OPEN dev campaign its per-committee target seats, so
// the Configuration form and the Final Decision dashboard have real numbers to
// read on a fresh database. Targets match the "12 total" example figure used
// throughout the spec. Idempotent — upserts on the (campaignId, committee)
// unique, so re-running it just resets the targets rather than duplicating rows.

const TARGETS: Record<Committee, number> = {
  MKT: 4,
  TM: 3,
  EER: 5,
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — cannot seed committee capacity.");
}

const adapter = new PrismaPg({ connectionString });
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

  console.log(`Campaign: ${campaign.name} (${campaign.id})`);

  for (const [committee, target] of Object.entries(TARGETS) as [
    Committee,
    number,
  ][]) {
    await prisma.committeeCapacity.upsert({
      where: { campaignId_committee: { campaignId: campaign.id, committee } },
      create: { campaignId: campaign.id, committee, target },
      update: { target },
    });
    console.log(`  ${committee.padEnd(3)} target ${target}`);
  }

  const rows = await prisma.committeeCapacity.findMany({
    where: { campaignId: campaign.id },
    select: { committee: true, target: true },
  });
  const total = rows.reduce((sum, r) => sum + r.target, 0);
  console.log(`Seeded ${rows.length} rows — ${total} total seats.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

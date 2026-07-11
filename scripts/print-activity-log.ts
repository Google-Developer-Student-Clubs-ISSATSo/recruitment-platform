import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — cannot read activity log.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const entries = await prisma.activityLogEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { actor: { select: { email: true } } },
  });

  if (entries.length === 0) {
    console.log("No activity log entries found.");
    return;
  }

  console.log(`Showing ${entries.length} most recent activity log entries:\n`);
  for (const e of entries) {
    const ts = e.createdAt.toISOString();
    const details = e.details ? JSON.stringify(e.details) : "-";
    console.log(
      `${ts}  ${e.actor.email.padEnd(28)}  ${e.actionType.padEnd(20)}  ${details}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

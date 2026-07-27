import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { ApplicantStatus, PhaseOneClassification } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { classifyCsv } from "@/app/(app)/campaigns/[campaignId]/applicants/import/parse";

// Benchmarks the OLD (per-row create-in-$transaction) vs NEW (batched
// createMany) import paths directly against the real database, bypassing the
// server action's auth/activity-log plumbing so it can run outside a request.
// Usage: npx tsx --env-file=.env scripts/bench-import.ts <csvFile>

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: bench-import.ts <csvFile>");
  process.exit(1);
}

async function oldApproach(campaignId: string, csvText: string) {
  const existing = new Set<string>();
  const { rows } = classifyCsv(csvText, existing);
  const toCreate = rows.filter(
    (r) => r.status === "import" || r.status === "auto_reject",
  );

  const creates = toCreate.map((r) => {
    const data: Prisma.ApplicantCreateInput = {
      campaign: { connect: { id: campaignId } },
      fullName: r.fullName,
      email: r.email,
      isIssatsoStudent: r.isIssatsoStudent!,
      preferredCommittee: r.preferredCommittee!,
      rawFormData: r.rawFormData as Prisma.InputJsonValue,
      status:
        r.status === "auto_reject"
          ? ApplicantStatus.REJECTED_PHASE1
          : ApplicantStatus.SUBMITTED,
      ...(r.status === "import"
        ? {
            phaseOneResult: {
              create: { classification: PhaseOneClassification.PENDING },
            },
          }
        : {}),
    };
    return prisma.applicant.create({ data });
  });

  await prisma.$transaction(creates);
  return rows;
}

async function newApproach(campaignId: string, csvText: string) {
  const existing = new Set<string>();
  const { rows } = classifyCsv(csvText, existing);
  const toCreate = rows.filter(
    (r) => r.status === "import" || r.status === "auto_reject",
  );

  await prisma.applicant.createMany({
    data: toCreate.map((r) => ({
      campaignId,
      fullName: r.fullName,
      email: r.email,
      isIssatsoStudent: r.isIssatsoStudent!,
      preferredCommittee: r.preferredCommittee!,
      rawFormData: r.rawFormData as Prisma.InputJsonValue,
      status:
        r.status === "auto_reject"
          ? ApplicantStatus.REJECTED_PHASE1
          : ApplicantStatus.SUBMITTED,
    })),
  });

  const scoreableEmails = toCreate
    .filter((r) => r.status === "import")
    .map((r) => r.email);

  if (scoreableEmails.length > 0) {
    const created = await prisma.applicant.findMany({
      where: { campaignId, email: { in: scoreableEmails } },
      select: { id: true },
    });
    await prisma.phaseOneResult.createMany({
      data: created.map((a) => ({
        applicantId: a.id,
        classification: PhaseOneClassification.PENDING,
      })),
    });
  }

  return rows;
}

async function run(label: string, campaignName: string, fn: typeof oldApproach) {
  const campaign = await prisma.campaign.create({
    data: { name: campaignName },
  });
  const csvText = readFileSync(csvPath!, "utf8");

  const start = Date.now();
  let error: unknown = null;
  try {
    await fn(campaign.id, csvText);
  } catch (e) {
    error = e;
  }
  const elapsedMs = Date.now() - start;

  const count = await prisma.applicant.count({
    where: { campaignId: campaign.id },
  });
  const resultCount = await prisma.phaseOneResult.count({
    where: { applicant: { campaignId: campaign.id } },
  });

  // Clean up so repeated runs don't pollute the DB.
  await prisma.phaseOneResult.deleteMany({
    where: { applicant: { campaignId: campaign.id } },
  });
  await prisma.applicant.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.campaign.delete({ where: { id: campaign.id } });

  console.log(
    `[${label}] ${elapsedMs}ms — applicants created: ${count}, phaseOneResults: ${resultCount}${
      error ? ` — FAILED: ${(error as Error).message}` : ""
    }`,
  );
}

async function main() {
  await run("OLD (per-row $transaction)", `bench-old-${Date.now()}`, oldApproach);
  await run("NEW (batched createMany)", `bench-new-${Date.now()}`, newApproach);
  await prisma.$disconnect();
}

main();

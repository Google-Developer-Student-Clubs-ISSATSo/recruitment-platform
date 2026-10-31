/**
 * Write ONE Markdown file with every applicant's interview dossier — jury,
 * interview scoring and remarks — so the core team can read it before the final
 * decision meeting. Read-only: nothing is written to the database and no email
 * is sent.
 *
 *   npx tsx --env-file=.env scripts/export-interview-dossiers.ts <campaignId> [outFile]
 *
 * Defaults to `exports/interview-dossiers-<campaign>.md`. The file opens with a
 * roster table, then one section per applicant for every status the
 * final-decision dashboard loads (SHORTLISTED / PENDING / ACCEPTED /
 * REJECTED_FINAL).
 *
 * PHASE 1 SCORES ARE DELIBERATELY ABSENT. The dashboard withholds them from MKT
 * and EER members (canViewPhase2Scores) so the figure can't anchor their
 * judgment, and this packet is meant for the whole core team.
 *
 * Rendering lives in src/lib/interview-dossier.ts — this file only queries and
 * writes, so the wording can be reused by an in-app export later.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { DASHBOARD_STATUSES } from "@/lib/final-decision";
import { formatAverage } from "@/lib/interview-note";
import {
  cell,
  renderDossier,
  slugify,
  statusLabel,
} from "@/lib/interview-dossier";
import { formatTunisDateTime } from "@/lib/tunis-time";

const campaignId = process.argv[2];
const outFileArg = process.argv[3];

if (!campaignId) {
  console.error(
    "Usage: tsx --env-file=.env scripts/export-interview-dossiers.ts <campaignId> [outFile]",
  );
  process.exit(1);
}

async function main() {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true },
  });
  if (!campaign) {
    console.error(`No campaign with id "${campaignId}".`);
    process.exit(1);
  }

  const applicants = await prisma.applicant.findMany({
    where: { campaignId, status: { in: [...DASHBOARD_STATUSES] } },
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
    select: {
      id: true,
      fullName: true,
      email: true,
      status: true,
      preferredCommittee: true,
      assignedCommittee: true,
      interviewSlot: { select: { scheduledTime: true, room: true } },
      interviewPanel: {
        select: {
          seats: {
            select: {
              kind: true,
              claimedBy: { select: { name: true, email: true } },
            },
          },
        },
      },
      interviewNote: {
        select: {
          personality: true,
          communication: true,
          motivation: true,
          creativity: true,
          problemSolving: true,
          stressManagement: true,
          teamWork: true,
          remarks: true,
          closedAt: true,
          closedBy: { select: { name: true, email: true } },
        },
      },
    },
  });

  const outFile = path.resolve(
    outFileArg ??
      `exports/interview-dossiers-${slugify(campaign.name) || campaign.id}.md`,
  );
  await mkdir(path.dirname(outFile), { recursive: true });

  const dossiers = applicants.map((a) => ({
    applicant: a,
    dossier: renderDossier(a, campaign.name, 2),
  }));

  const rosterRows = dossiers.map(({ applicant: a, dossier }) => {
    const interview = a.interviewSlot?.scheduledTime
      ? formatTunisDateTime(a.interviewSlot.scheduledTime)
      : "not booked";
    return `| ${cell(a.fullName)} | ${statusLabel(a.status)} | ${interview} | ${formatAverage(
      dossier.average,
    )} | ${dossier.juryFilled}/${dossier.juryTotal} |`;
  });

  const markdown = [
    `# Interview dossiers — ${campaign.name}`,
    "",
    `Generated ${formatTunisDateTime(new Date())} · ${applicants.length} applicant(s).`,
    "",
    "> Phase 1 scores are deliberately excluded (MKT/EER may not see them).",
    "",
    "## Roster",
    "",
    "| Applicant | Status | Interview | Interview avg | Jury filled |",
    "| --- | --- | --- | --- | --- |",
    ...rosterRows,
    "",
    ...dossiers.map(({ dossier }) => `---\n\n${dossier.markdown}\n`),
  ].join("\n");

  await writeFile(outFile, markdown, "utf8");

  console.log(`Campaign:   ${campaign.name}`);
  console.log(`Applicants: ${applicants.length}`);
  console.log(`Written to: ${outFile}`);
}

void main().finally(() => prisma.$disconnect());

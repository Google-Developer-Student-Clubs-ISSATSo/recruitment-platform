/**
 * Send one real Phase 1 acceptance email to a chosen address, through the exact
 * production send path (`sendTemplatedEmail` → the shared Gmail SMTP transport),
 * so template and MIME changes can be checked in a real inbox rather than a
 * preview. Nothing is written to EmailLog and no applicant is touched.
 *
 *   npx tsx --env-file=.env scripts/send-test-phase1-email.ts <to@example.com> [campaignId]
 *
 * The GDG Day date/time and location are read from the Campaign row — the same
 * source the real batch (`runPhaseOneEmailBatch`) reads — so what lands in the
 * inbox reflects whatever is currently saved in Configuration. They are
 * deliberately NOT defaulted here: an earlier version of this script passed a
 * literal location, which made a correctly-wired template look hardcoded.
 * With no campaignId argument the most recently created campaign is used.
 */
import { createElement } from "react";

import { prisma } from "@/lib/prisma";
import { sendTemplatedEmail } from "@/lib/send-email";
import { PHASE1_SUBJECT } from "@/lib/phase1-email-templates";
import { PhaseOneAcceptanceEmail } from "@/emails/PhaseOneAcceptanceEmail";

const to = process.argv[2];
const campaignId = process.argv[3];
if (!to) {
  console.error(
    "Usage: tsx --env-file=.env scripts/send-test-phase1-email.ts <to> [campaignId]",
  );
  process.exit(1);
}

async function main() {
  const campaign = campaignId
    ? await prisma.campaign.findUnique({ where: { id: campaignId } })
    : await prisma.campaign.findFirst({ orderBy: { createdAt: "desc" } });

  if (!campaign) {
    console.error("No campaign found to read GDG Day details from.");
    process.exit(1);
  }
  if (!campaign.gdgDayDateTime || !campaign.gdgDayLocation) {
    console.error(
      `Campaign "${campaign.name}" has no GDG Day date/time or location set — ` +
        "set them in Configuration first.",
    );
    process.exit(1);
  }

  console.log(
    `Campaign: ${campaign.name}\nLocation from DB: ${campaign.gdgDayLocation}`,
  );

  const result = await sendTemplatedEmail({
    to: to!,
    subject: PHASE1_SUBJECT.ACCEPTANCE,
    component: createElement(PhaseOneAcceptanceEmail, {
      name: "Aziz",
      gdgDayDateTime: campaign.gdgDayDateTime,
      gdgDayLocation: campaign.gdgDayLocation,
    }),
  });

  console.log(result.ok ? `Sent to ${to}` : `FAILED: ${result.error}`);
  process.exit(result.ok ? 0 : 1);
}

void main();

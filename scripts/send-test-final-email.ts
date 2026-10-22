/**
 * Send one real final-result email to a chosen address, through the exact
 * production send path (`sendTemplatedEmail` → the shared Gmail SMTP transport),
 * so template and MIME changes can be checked in a real inbox rather than a
 * preview. Nothing is written to EmailLog and no applicant is touched.
 *
 *   npx tsx --env-file=.env scripts/send-test-final-email.ts <to@example.com> [acceptance|rejection] [campaignId]
 *
 * Defaults to the acceptance email. The links are read from the Campaign row —
 * the same source `runFinalResultsBatch` reads — so what lands in the inbox
 * reflects whatever is currently saved in Configuration. With no campaignId
 * argument the most recently created campaign is used.
 *
 * Only the links the chosen template actually interpolates are required: the
 * acceptance email needs the form/program/platform links, the rejection email
 * needs the Discord invite. (The real batch refuses unless all four are set,
 * because it sends both templates in one pass.)
 */
import { createElement } from "react";

import { prisma } from "@/lib/prisma";
import { committeeLabel } from "@/lib/committee";
import { sendTemplatedEmail } from "@/lib/send-email";
import { FINAL_SUBJECT } from "@/lib/final-email-templates";
import {
  FINAL_EMAIL_LINK_FIELDS,
  missingLinks,
  type FinalEmailLinks,
} from "@/lib/final-email-links";
import { FinalAcceptanceEmail } from "@/emails/FinalAcceptanceEmail";
import { FinalRejectionEmail } from "@/emails/FinalRejectionEmail";
import { Committee } from "@/generated/prisma/enums";

const to = process.argv[2];
const which = (process.argv[3] ?? "acceptance").toLowerCase();
const campaignId = process.argv[4];

if (!to || (which !== "acceptance" && which !== "rejection")) {
  console.error(
    "Usage: tsx --env-file=.env scripts/send-test-final-email.ts <to> [acceptance|rejection] [campaignId]",
  );
  process.exit(1);
}

async function main() {
  const campaign = campaignId
    ? await prisma.campaign.findUnique({ where: { id: campaignId } })
    : await prisma.campaign.findFirst({ orderBy: { createdAt: "desc" } });

  if (!campaign) {
    console.error(
      campaignId
        ? `No campaign with id "${campaignId}".`
        : "No campaign found to read the final-email links from.",
    );
    process.exit(1);
  }

  const links: FinalEmailLinks = {
    acceptanceFormLink: campaign.acceptanceFormLink,
    gdgcProgramLink: campaign.gdgcProgramLink,
    gdgcPlatformLink: campaign.gdgcPlatformLink,
    discordInviteLink: campaign.discordInviteLink,
  };

  const requiredKeys =
    which === "acceptance"
      ? ["acceptanceFormLink", "gdgcProgramLink", "gdgcPlatformLink"]
      : ["discordInviteLink"];
  const missing = missingLinks(links)
    .filter((key) => requiredKeys.includes(key))
    .map((key) => FINAL_EMAIL_LINK_FIELDS.find((f) => f.key === key)!.label);

  if (missing.length > 0) {
    console.error(
      `Campaign "${campaign.name}" is missing: ${missing.join(", ")} — ` +
        "set them in Configuration first.",
    );
    process.exit(1);
  }

  const name = "Aziz";
  const [subject, component] =
    which === "acceptance"
      ? [
          FINAL_SUBJECT.ACCEPTANCE,
          createElement(FinalAcceptanceEmail, {
            name,
            committee: committeeLabel(Committee.MKT),
            acceptanceFormLink: links.acceptanceFormLink!,
            gdgcProgramLink: links.gdgcProgramLink!,
            gdgcPlatformLink: links.gdgcPlatformLink!,
          }),
        ]
      : [
          FINAL_SUBJECT.REJECTION,
          createElement(FinalRejectionEmail, {
            name,
            discordInviteLink: links.discordInviteLink!,
          }),
        ];

  console.log(
    `Template: ${which}\nSubject:  ${subject}\nCampaign: ${campaign.name}\nImages from: ${process.env.NEXT_PUBLIC_APP_URL ?? "(unset)"}`,
  );

  const result = await sendTemplatedEmail({ to: to!, subject, component });

  console.log(result.ok ? `Sent to ${to}` : `FAILED: ${result.error}`);
  process.exit(result.ok ? 0 : 1);
}

void main();

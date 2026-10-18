/**
 * Send one real Phase 1 REJECTION email to a chosen address, through the exact
 * production send path (`sendTemplatedEmail` → the shared Gmail SMTP transport).
 * Nothing is written to EmailLog, no applicant is touched, and it never goes
 * near the database (the rejection needs no campaign data).
 *
 *   npx tsx --env-file=.env scripts/send-test-phase1-rejection-email.ts <to@example.com>
 */
import { createElement } from "react";

import { sendTemplatedEmail } from "@/lib/send-email";
import { PHASE1_SUBJECT } from "@/lib/phase1-email-templates";
import { PhaseOneRejectionEmail } from "@/emails/PhaseOneRejectionEmail";

const to = process.argv[2];
if (!to) {
  console.error(
    "Usage: tsx --env-file=.env scripts/send-test-phase1-rejection-email.ts <to>",
  );
  process.exit(1);
}

async function main() {
  console.log(`Subject:   ${PHASE1_SUBJECT.REJECTION}`);
  console.log(`Images from: ${process.env.NEXT_PUBLIC_APP_URL ?? "(unset)"}`);

  const result = await sendTemplatedEmail({
    to: to!,
    subject: PHASE1_SUBJECT.REJECTION,
    component: createElement(PhaseOneRejectionEmail, { name: "Aziz" }),
  });

  console.log(result.ok ? `Sent to ${to}` : `FAILED: ${result.error}`);
  process.exit(result.ok ? 0 : 1);
}

void main();

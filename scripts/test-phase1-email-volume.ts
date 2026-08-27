/**
 * Volume test for the Gmail SMTP send path: fires 150 Phase 1 REJECTION
 * emails sequentially through the exact production send path
 * (`sendTemplatedEmail` → the shared Gmail SMTP transport), mirroring
 * `runPhaseOneEmailBatch`'s actual sequential-for-loop behavior with no
 * artificial delay, so Gmail's real throttling behavior under realistic
 * load can be observed. Rejection-only because it needs no GDG Day
 * date/time/location, so this script has zero dependency on campaign
 * state. Nothing is written to EmailLog and no Applicant/Campaign row is
 * touched.
 *
 *   npx tsx --env-file=.env scripts/test-phase1-email-volume.ts
 */
import { createElement } from "react";

import { sendTemplatedEmail } from "@/lib/send-email";
import { PHASE1_SUBJECT } from "@/lib/phase1-email-templates";
import { PhaseOneRejectionEmail } from "@/emails/PhaseOneRejectionEmail";

const ADDRESS_COUNTS: { email: string; count: number }[] = [
  { email: "techLeadGdgc@gmail.com", count: 30 },
  { email: "krifaaziz5050@gmail.com", count: 40 },
  { email: "krifaaziz80@gmail.com", count: 40 },
  { email: "krifaaziz04@gmail.com", count: 40 },
];

// Fixed seed so the shuffle order is reproducible across runs.
const SEED = 42;

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Recipient = { name: string; email: string };

function buildRecipients(): Recipient[] {
  const recipients: Recipient[] = [];
  let counter = 1;
  for (const { email, count } of ADDRESS_COUNTS) {
    for (let i = 0; i < count; i++) {
      recipients.push({ name: `Test Applicant ${counter}`, email });
      counter++;
    }
  }
  return shuffle(recipients, mulberry32(SEED));
}

async function main() {
  const recipients = buildRecipients();

  const perAddress = new Map<string, { sent: number; failed: number }>(
    ADDRESS_COUNTS.map((a) => [a.email, { sent: 0, failed: 0 }]),
  );

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i++) {
    const { name, email } = recipients[i];
    const result = await sendTemplatedEmail({
      to: email,
      subject: PHASE1_SUBJECT.REJECTION,
      component: createElement(PhaseOneRejectionEmail, { name }),
    });

    const stats = perAddress.get(email)!;
    if (result.ok) {
      sent++;
      stats.sent++;
      console.log(`[${i + 1}/150] ${email} — ok`);
    } else {
      failed++;
      stats.failed++;
      console.log(`[${i + 1}/150] ${email} — FAILED: ${result.error}`);
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Total sent: ${sent}`);
  console.log(`Total failed: ${failed}`);
  console.log("Per-address breakdown:");
  for (const { email, count } of ADDRESS_COUNTS) {
    const stats = perAddress.get(email)!;
    console.log(`  ${email}: ${stats.sent}/${count} sent, ${stats.failed}/${count} failed`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

void main();

/**
 * Send one real interview booking email to a chosen address, through the exact
 * production send path (`sendTemplatedEmail` → the shared Gmail SMTP transport),
 * so template and MIME changes can be checked in a real inbox rather than a
 * preview. Nothing is written to EmailLog, no applicant is touched, and no
 * InterviewSlot is created — this never goes near the database.
 *
 *   npx tsx --env-file=.env scripts/send-test-interview-email.ts <to@example.com> [invite|reminder] [calendarLink]
 *
 * Defaults to the invite. The calendar link defaults to a placeholder — pass one
 * explicitly to preview a real campaign's link. The templates require it, so
 * there is no hardcoded URL to fall back on.
 *
 * ⚠️ The banner and footer logo resolve against NEXT_PUBLIC_APP_URL. If that
 * points at localhost the message still sends, but both images arrive blank —
 * point it at an ngrok tunnel to check them for real.
 */
import { createElement } from "react";

import { sendTemplatedEmail } from "@/lib/send-email";
import { INTERVIEW_SUBJECT } from "@/lib/interview-email-templates";
import { InterviewBookingInviteEmail } from "@/emails/InterviewBookingInviteEmail";
import { InterviewBookingReminderEmail } from "@/emails/InterviewBookingReminderEmail";

const to = process.argv[2];
const which = (process.argv[3] ?? "invite").toLowerCase();
const calendarLink = process.argv[4] ?? "https://example.com/booking-preview";

if (!to || (which !== "invite" && which !== "reminder")) {
  console.error(
    "Usage: tsx --env-file=.env scripts/send-test-interview-email.ts <to> [invite|reminder]",
  );
  process.exit(1);
}

async function main() {
  const name = "Aziz";
  const [subject, component] =
    which === "invite"
      ? [
          INTERVIEW_SUBJECT.BOOKING_INVITE,
          createElement(InterviewBookingInviteEmail, { name, calendarLink }),
        ]
      : [
          INTERVIEW_SUBJECT.BOOKING_REMINDER,
          createElement(InterviewBookingReminderEmail, { name, calendarLink }),
        ];

  console.log(`Template: ${which}\nSubject:  ${subject}\nLink:     ${calendarLink}`);
  console.log(`Images from: ${process.env.NEXT_PUBLIC_APP_URL ?? "(unset)"}`);

  const result = await sendTemplatedEmail({ to: to!, subject, component });

  console.log(result.ok ? `Sent to ${to}` : `FAILED: ${result.error}`);
  process.exit(result.ok ? 0 : 1);
}

void main();

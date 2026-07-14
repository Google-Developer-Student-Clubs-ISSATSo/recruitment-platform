import { createTransport } from "nodemailer";

// The single Gmail SMTP transport used for every outbound email — magic-link
// sign-in (auth.ts) and member invites (permissions/actions.ts) both use this,
// so there is one place that owns the mail configuration.
export const SMTP_TRANSPORT = {
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
} as const;

/**
 * Send one email through the shared transport. Throws if the recipient was
 * rejected so callers can surface a real failure instead of silently
 * pretending the mail was sent.
 */
export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const transport = createTransport(SMTP_TRANSPORT);
  const result = await transport.sendMail({
    from: process.env.EMAIL_FROM,
    ...message,
  });

  const failed = [
    ...(result.rejected ?? []),
    ...(result.pending ?? []),
  ].filter(Boolean);
  if (failed.length) {
    throw new Error(`Email to ${failed.join(", ")} could not be sent`);
  }
  return result;
}

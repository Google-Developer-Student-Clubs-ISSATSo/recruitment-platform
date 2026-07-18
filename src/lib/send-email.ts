import * as React from "react";
import { render } from "@react-email/render";

import { sendMail } from "@/lib/email";

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Render a React Email component to HTML (plus a plain-text fallback) and send
 * it through the shared Gmail SMTP transport — the same one magic-link sign-in
 * and member invites use (see {@link sendMail} / SMTP_TRANSPORT).
 *
 * Nothing is attached: the banner and footer logo are plain hosted <img> URLs
 * built from NEXT_PUBLIC_APP_URL (see BaseEmailLayout), so the message carries
 * only HTML and text. That is what keeps it small and free of attachment chips —
 * a CID part is still an attachment to the client no matter how it's labelled.
 * The trade-off is that those URLs must be publicly reachable at delivery time.
 *
 * The `subject` is always supplied by the caller (each template has its own
 * fixed subject) — it is never defaulted or prefixed here.
 *
 * Never throws: a rejected recipient or SMTP error is caught and returned as
 * `{ ok: false, error }` so a batch caller can log the failure and keep going.
 */
export async function sendTemplatedEmail({
  to,
  subject,
  component,
}: {
  to: string;
  subject: string;
  component: React.ReactElement;
}): Promise<SendResult> {
  try {
    const html = await render(component);
    const text = await render(component, { plainText: true });
    await sendMail({ to, subject, html, text });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown email error",
    };
  }
}

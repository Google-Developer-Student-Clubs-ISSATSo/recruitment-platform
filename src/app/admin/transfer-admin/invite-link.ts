/**
 * Pure helpers shared by the transfer-invite server actions and the accept
 * page. They live outside actions.ts because a "use server" module may only
 * export async functions — these are plain synchronous utilities.
 */

/**
 * How long an invite stays acceptable. The Transfer Admin Role screen has
 * always told the outgoing lead "they must accept within 48 hours"; this is the
 * server-side half of that promise. Derived from createdAt rather than stored,
 * so it can never drift from the row.
 */
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

export function isInviteExpired(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > INVITE_TTL_MS;
}

/**
 * Absolute origin for links that travel inside an email.
 *
 * NEXT_PUBLIC_APP_URL is stored without a scheme ("example.vercel.app"), which
 * is fine for the layout's <img> tags but would make an anchor href resolve
 * relative to the mail client. A link is the entire point of this email, so the
 * scheme is normalised here rather than trusting the env value's shape.
 */
export function appOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/**
 * Where an invited member goes to accept. Two deliberate choices here:
 *
 * 1. NOT under /admin — the recipient does not hold MANAGE_ACCOUNTS yet, so the
 *    /admin layout guard would bounce them straight out of their own invite.
 * 2. The token is a PATH SEGMENT, not a `?token=` query parameter. Mail is
 *    transferred quoted-printable, where `=` introduces an escape: a link
 *    ending `?token=17ab…` is decoded by the receiving client as `?token` plus
 *    the literal byte 0x17, silently corrupting every token that happens to
 *    start with two hex digits. This was observed in a real delivered message —
 *    keeping `=` out of the URL removes the failure mode entirely rather than
 *    relying on each hop's encoder to escape it correctly.
 */
export function buildAcceptUrl(token: string): string {
  return `${appOrigin()}/transfer-accept/${token}`;
}

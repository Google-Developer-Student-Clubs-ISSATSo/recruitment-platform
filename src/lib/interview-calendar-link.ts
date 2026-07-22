export type ParsedLink =
  | { ok: true; link: string }
  | { ok: false; error: string };

/**
 * Validate a booking calendar link before it is stored.
 *
 * The value ends up as an anchor `href` in an email sent to applicants, so this
 * is deliberately restrictive: only absolute http(s) URLs pass. A bare string
 * ("bit.ly/foo") is rejected because it would resolve relative to the mail
 * client, and `javascript:` / `data:` URIs are rejected outright.
 *
 * Pure and dependency-free so the server action can stay a thin auth wrapper and
 * this can be exercised directly.
 */
export function parseCalendarLink(raw: string): ParsedLink {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Enter a calendar link." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Enter a full URL, including https://" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "The link must be an http or https URL." };
  }

  return { ok: true, link: trimmed };
}

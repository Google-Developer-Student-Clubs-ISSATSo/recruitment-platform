// The four external destinations the final-result emails link to. Pure and
// dependency-free — the Configuration form (client) and the send batch (server)
// both import this, so the field list, labels and validation live in one place.

/** Campaign column names, in the order the form shows them. */
export const FINAL_EMAIL_LINK_FIELDS = [
  {
    key: "acceptanceFormLink",
    label: "Acceptance Form",
    hint: "Accepted applicants confirm their place here, within 24 hours.",
    placeholder: "https://docs.google.com/forms/…",
  },
  {
    key: "gdgcProgramLink",
    label: "GDGC Program Page",
    hint: "Google's page describing the GDG on Campus program.",
    placeholder: "https://developers.google.com/community/…",
  },
  {
    key: "gdgcPlatformLink",
    label: "GDGC Platform Page",
    hint: "The club's own chapter page.",
    placeholder: "https://gdg.community.dev/…",
  },
  {
    key: "discordInviteLink",
    label: "Discord Invite",
    hint: "Rejected applicants are pointed here for interview feedback.",
    placeholder: "https://discord.gg/…",
  },
] as const;

export type FinalEmailLinkKey = (typeof FINAL_EMAIL_LINK_FIELDS)[number]["key"];

/** All four values, as stored. Null means "not configured yet". */
export type FinalEmailLinks = Record<FinalEmailLinkKey, string | null>;

/**
 * Trim and normalize one submitted value. An empty field clears back to null
 * rather than storing "", so "not configured" has exactly one representation
 * and the missing-link check can't be fooled by a blank string.
 */
export function normalizeLink(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Which links are still missing. The send batch refuses while this is non-empty
 * and the button stays disabled — an acceptance email whose form link is blank
 * would tell people to complete a form that isn't there.
 */
export function missingLinks(links: FinalEmailLinks): FinalEmailLinkKey[] {
  return FINAL_EMAIL_LINK_FIELDS.filter((f) => !links[f.key]).map((f) => f.key);
}

/** Human-readable list for the disabled-state message. */
export function missingLinkLabels(links: FinalEmailLinks): string[] {
  const missing = new Set(missingLinks(links));
  return FINAL_EMAIL_LINK_FIELDS.filter((f) => missing.has(f.key)).map(
    (f) => f.label,
  );
}

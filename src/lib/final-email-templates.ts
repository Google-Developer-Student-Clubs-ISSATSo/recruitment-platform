// Template keys and subjects for the two final-result emails. A plain module
// (not the "use server" actions file, whose exports must all be async) so the
// final-decision page, the send batch and the EmailLog dedup all agree on the
// exact strings. templateKey is what EmailLog rows are keyed by, so it must
// stay stable once anything has been sent.

export const FINAL_TEMPLATE = {
  ACCEPTANCE: "FINAL_ACCEPTANCE",
  REJECTION: "FINAL_REJECTION",
} as const;

export const FINAL_SUBJECT = {
  ACCEPTANCE:
    "Welcome to Google Developer Groups on Campus ISSATSo Chapter Core Team",
  REJECTION: "Response to joining GDGC - ISSATSo Core Team",
} as const;

// NOTE: the four external URLs deliberately do NOT live here — they are
// per-campaign (Campaign.acceptanceFormLink and friends) because the acceptance
// form and Discord invite are regenerated each cycle. Both templates take them
// as required props; the batch reads them from the campaign and refuses to send
// if any is unset.

// Template keys, subjects and the shared booking URL for the two interview
// booking emails. Kept in a plain module (not the "use server" actions file,
// whose exports must all be async) so the interviews page, the batch-send lib
// and both templates agree on the exact strings. templateKey is what EmailLog
// rows are keyed by, so it must stay stable.

export const INTERVIEW_TEMPLATE = {
  BOOKING_INVITE: "INTERVIEW_BOOKING_INVITE",
  BOOKING_REMINDER: "INTERVIEW_BOOKING_REMINDER",
} as const;

export const INTERVIEW_SUBJECT = {
  BOOKING_INVITE: "[GDGC ISSATSo Recruitment] Book Your Interview!",
  BOOKING_REMINDER: "[GDGC ISSATSo Recruitment] Reminder: Book Your Interview!",
} as const;

// NOTE: the booking calendar URL deliberately does NOT live here. It is
// per-campaign (Campaign.interviewCalendarLink) because the club regenerates
// the short link each cycle — a module-level constant would silently send last
// year's link. Both templates take it as a required prop; the batch reads it
// from the campaign and refuses to send if it isn't set.

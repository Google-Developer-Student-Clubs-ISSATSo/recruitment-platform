// The club is based in Sousse, Tunisia, so every wall-clock time a coordinator
// types — GDG Day, an interview slot — is meant as Tunisian local time. Tunisia
// is UTC+1 all year with no DST, so the offset is pinned explicitly here rather
// than read from the server's TZ: the stored instant then matches what was typed
// no matter where this code runs.

const TUNIS_UTC_OFFSET = "+01:00";
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Parse the "YYYY-MM-DDTHH:MM" a `datetime-local` input produces (wall-clock
 * minutes, no zone) into the instant it denotes in Tunis. Returns null for
 * anything malformed, so callers can reject invalid input rather than storing an
 * Invalid Date.
 */
export function parseTunisLocal(value: string): Date | null {
  if (!LOCAL_DATETIME_RE.test(value)) return null;
  const date = new Date(`${value}:00${TUNIS_UTC_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The inverse: render a stored instant as the "YYYY-MM-DDTHH:MM" a
 * `datetime-local` input wants, expressed in Tunis time — so the field shows the
 * same wall-clock that was originally typed.
 */
export function tunisInputValue(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  // en-CA hour-cycle can emit "24" for midnight; datetime-local needs "00".
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/**
 * The Tunis calendar date an instant falls on, as "YYYY-MM-DD".
 *
 * This is the grouping key for the panel board's day sections, and it must be
 * derived in Tunis rather than from the server's zone: an interview at 00:30
 * Tunis is still "today" locally but belongs to the previous UTC day, which
 * would file it under the wrong header. Sorts correctly as a plain string.
 */
export function tunisDateKey(d: Date): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the key shape we want.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** e.g. "Tuesday, July 21" — the panel board's day header. */
export function formatTunisDayLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Tunis",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(d);
}

/** e.g. "2:30 PM" — the time alone, for cards already sitting under a day header. */
export function formatTunisTimeOfDay(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Tunis",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** e.g. "November 1, 2026" — the calendar date alone, for milestone lines. */
export function formatTunisDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Tunis",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

/** e.g. "Sat, Nov 1, 2026, 3:00 PM" — Tunis time, for read-only display. */
export function formatTunisDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Tunis",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

// Pure, dependency-free note helpers. Deliberately imports NOTHING from the
// database layer: this module is pulled into the client bundle by NoteEditor,
// and importing prisma here drags the whole pg stack into the browser build.
// Anything that touches the database lives in interview-note-store.ts.
/**
 * The seven rated dimensions, in display order. Keys match InterviewNote
 * columns exactly, so a field can be saved by name without a lookup table and
 * the UI can't drift from the schema.
 */
export const NOTE_FIELDS = [
  {
    key: "personality",
    label: "Personality",
    hint: "Confidence, attitude, and how they carry themselves.",
  },
  {
    key: "communication",
    label: "Communication",
    hint: "Clarity of thought and articulation.",
  },
  {
    key: "motivation",
    label: "Motivation",
    hint: "Genuine drive to join and contribute.",
  },
  {
    key: "creativity",
    label: "Creativity",
    hint: "Original thinking and fresh ideas.",
  },
  {
    key: "problemSolving",
    label: "Problem Solving",
    hint: "Structured reasoning under an unfamiliar problem.",
  },
  {
    key: "stressManagement",
    label: "Stress Management",
    hint: "Composure when pushed or challenged.",
  },
  {
    key: "teamWork",
    label: "Team Work",
    hint: "Collaboration and handling disagreement.",
  },
] as const;

export type NoteFieldKey = (typeof NOTE_FIELDS)[number]["key"];

const FIELD_KEYS = new Set<string>(NOTE_FIELDS.map((f) => f.key));

export function isNoteFieldKey(value: string): value is NoteFieldKey {
  return FIELD_KEYS.has(value);
}

/** Ratings run 0–10 in quarter steps: 41 possible values per field. */
export const RATING_MIN = 0;
export const RATING_MAX = 10;
export const RATING_STEP = 0.25;

/**
 * Validate one rating. Rejects out-of-range values and anything off the 0.25
 * grid, so a hand-crafted request can't store 7.31 or 99.
 */
export function isValidRating(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (value < RATING_MIN || value > RATING_MAX) return false;
  // Compare in quarter-units to sidestep float drift (7.25 / 0.25 === 29).
  const steps = value / RATING_STEP;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

export type NoteScores = Partial<Record<NoteFieldKey, number | null>>;

/**
 * Mean of whichever fields currently hold a value.
 *
 * Deliberately NOT stored — the schema comment says AVG is computed on read,
 * so it can never drift from the scores it summarises. Returns null when
 * nothing is rated yet, which the UI shows as an em dash rather than a
 * misleading 0.0. Partial notes average over what exists, so the figure is
 * meaningful from the first field onward rather than only once all 7 are in.
 */
export function computeAverage(scores: NoteScores): number | null {
  const values = NOTE_FIELDS.map((f) => scores[f.key]).filter(
    (v): v is number => typeof v === "number",
  );
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** One decimal, matching the design's "0.0" readout. */
export function formatAverage(avg: number | null): string {
  return avg === null ? "—" : avg.toFixed(1);
}

/**
 * Has this applicant's interview actually happened and been written up?
 *
 * The signal is the note's close state, NOT `InterviewSlot.scheduledTime`
 * against the clock. A slot time in the past proves only that a moment passed:
 * a no-show, or an interview rescheduled without the slot being updated, would
 * both read as "done" under a time comparison. Closing the note is the point at
 * which a human confirms the interview took place and the record is finished,
 * so that is what "done" means here.
 *
 * No note row at all is NOT done — nothing can be complete before anyone has
 * even started writing it. Reopening a note (which clears `closedAt`) makes it
 * not-done again, so callers must read this off the CURRENT row rather than
 * caching a one-time flag.
 *
 * Deliberately a pure predicate over the one field it needs, so the same rule
 * serves the client board and the server-side release guard without either
 * re-stating it.
 */
export function isInterviewDone(
  note: { closedAt: Date | null } | null | undefined,
): boolean {
  return note?.closedAt != null;
}

/**
 * How long after the scheduled start a note stays locked. A panellist should be
 * writing up an interview that has actually happened, not closing the record
 * before the candidate has sat down — but an interview that started late, or
 * one being written up the moment it ends, must not be blocked either, so the
 * bar is the START time plus a short grace rather than any guess at a duration.
 */
export const NOTE_CLOSE_GRACE_MINUTES = 10;

export type NoteCloseEligibility =
  /** Past the threshold, or there is no scheduled time to measure against. */
  | { state: "allowed" }
  /** Before the threshold — only an Administrator may force past this. */
  | { state: "too_early"; allowedAt: Date };

/**
 * May this note be closed yet, ignoring who is asking?
 *
 * TIMEZONE: there is deliberately NO timezone handling in here, and that is the
 * correct behaviour rather than an omission. `scheduledTime` is stored as an
 * absolute instant — the coordinator's Tunis wall-clock is resolved to one at
 * entry by parseTunisLocal, which pins +01:00 explicitly (see lib/tunis-time.ts)
 * — so comparing it against `now`, also an instant, is a comparison of two
 * points on the same timeline. It yields the identical answer whether this runs
 * on a server in Tunis, in UTC, or anywhere else, and for a viewer in any zone.
 * Converting either side to a wall-clock first is what would BREAK it. Tunis
 * time matters only for DISPLAYING the threshold to a human.
 *
 * A null `scheduledTime` is "allowed": with no time recorded there is nothing
 * to be early relative to, and blocking forever would strand a note that can
 * never be closed. The board only lists scheduled applicants, so this is the
 * unusual path, not the normal one.
 */
export function noteCloseEligibility({
  scheduledTime,
  now,
  graceMinutes = NOTE_CLOSE_GRACE_MINUTES,
}: {
  scheduledTime: Date | null | undefined;
  now: Date;
  graceMinutes?: number;
}): NoteCloseEligibility {
  if (!scheduledTime) return { state: "allowed" };

  const allowedAt = new Date(scheduledTime.getTime() + graceMinutes * 60_000);
  return now.getTime() >= allowedAt.getTime()
    ? { state: "allowed" }
    : { state: "too_early", allowedAt };
}


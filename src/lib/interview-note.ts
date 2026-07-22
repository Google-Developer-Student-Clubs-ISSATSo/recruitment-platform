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


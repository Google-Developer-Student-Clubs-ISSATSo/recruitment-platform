import { Committee } from "@/generated/prisma/enums";

// Pure, dependency-free capacity helpers. Deliberately imports NOTHING from the
// database layer: this module is pulled into the client bundle by CapacityForm,
// and importing prisma here drags the whole pg stack into the browser build.
// Anything that touches the database lives in committee-capacity-store.ts.

// Capacity is configured for every committee, always in the same fixed
// MKT → TM → EER order the rest of the app displays them in. Declared as a
// literal (rather than Object.values(Committee)) so the form's field order is
// stable and can't be reshuffled by an enum edit.
export const CAPACITY_COMMITTEES: readonly Committee[] = [
  Committee.MKT,
  Committee.TM,
  Committee.EER,
];

/** Target seats per committee. Always has an entry for every committee. */
export type CapacityTargets = Record<Committee, number>;

/** Total seats across all committees — the informational figure on the form. */
export function totalSeats(targets: CapacityTargets): number {
  return CAPACITY_COMMITTEES.reduce(
    (sum, committee) => sum + targets[committee],
    0,
  );
}

/**
 * Targets are seat counts: non-negative whole numbers. Anything else — NaN from
 * an emptied field, a negative, a decimal — collapses to a value the column can
 * hold rather than throwing, so a half-filled form still saves. Shared by the
 * form (for its live total) and the action (before writing), so what the user
 * sees totalled is what gets stored.
 */
export function sanitizeTarget(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

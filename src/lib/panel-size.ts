import { PanelSeatKind } from "@/generated/prisma/enums";
import { SEAT_KIND_ORDER } from "@/lib/panel-seat-kind";

// The panel-size vocabulary. Pure and dependency-free, like panel-seat-kind
// next door — the size form is a client component, so anything it needs has to
// stay clear of the database modules that read the setting.

/** The only two panel shapes the club runs. */
export const PANEL_SIZES = [3, 4] as const;
export type PanelSize = (typeof PANEL_SIZES)[number];

export const DEFAULT_PANEL_SIZE: PanelSize = 3;

export function isPanelSize(value: number): value is PanelSize {
  return (PANEL_SIZES as readonly number[]).includes(value);
}

/**
 * The seat kinds a panel of this size is made of: the first `size` entries of
 * the fixed order, so 3 → MKT/TM/EER and 4 → MKT/TM/EER/FLOATING. Deriving it
 * rather than listing both shapes keeps "what a 4-seat panel is" from being
 * stated twice.
 */
export function seatKindsForPanelSize(
  size: PanelSize,
): readonly PanelSeatKind[] {
  return SEAT_KIND_ORDER.slice(0, size);
}

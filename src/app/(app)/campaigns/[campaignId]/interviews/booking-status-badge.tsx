// Booking state → label + Tailwind token classes, mirroring
// phase1/selection/classification-badge.tsx. Colours are our status tokens only.
// Presentational and hook-free, so usable from server or client.
//
// Three states, not two: "Scheduled" (green) and "Not yet booked" (amber) are
// the two the coordinator acts on, but a shortlisted applicant with no slot row
// at all hasn't even been *sent* the booking link yet, and that is a different
// problem with a different fix — so it reads neutral rather than borrowing the
// amber that means "invited, still waiting on them".
export type BookingState = "SCHEDULED" | "NOT_BOOKED" | "NOT_INVITED";

const BOOKING_STYLES: Record<BookingState, { label: string; className: string }> = {
  SCHEDULED: {
    label: "Scheduled",
    className: "bg-status-accepted/10 text-status-accepted",
  },
  NOT_BOOKED: {
    label: "Not yet booked",
    className: "bg-status-pending/15 text-[color:var(--status-pending)]",
  },
  NOT_INVITED: {
    label: "Not invited",
    className:
      "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300",
  },
};

export function BookingStatusBadge({ value }: { value: BookingState }) {
  const { label, className } = BOOKING_STYLES[value];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

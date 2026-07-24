import { PhaseOneClassification } from "@/generated/prisma/enums";

// Phase 1 classification → label + Tailwind token classes, mirroring
// applicants/status-badge.tsx. Colours are our status tokens only — the
// to-discuss badge uses status-pending (the yellow already in the palette),
// never a raw orange. Presentational and hook-free, so server or client.
//
// Auto vs. manual share a colour on purpose: green means "this person is in"
// however that was decided.
//
// Only the AUTO_* labels name their origin. A human decision just reads
// "Accepted" / "Rejected" — from the reviewer's side that is simply the outcome,
// and calling it "Manual Accept" restated a distinction the Auto labels already
// draw by contrast. The enum values are untouched; this is display text only.
const CLASSIFICATION_STYLES: Record<
  PhaseOneClassification,
  { label: string; className: string }
> = {
  [PhaseOneClassification.PENDING]: {
    label: "Pending",
    className:
      "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300",
  },
  [PhaseOneClassification.AUTO_ACCEPT]: {
    label: "Auto Accepted",
    className: "bg-status-accepted/10 text-status-accepted",
  },
  [PhaseOneClassification.MANUAL_ACCEPT]: {
    label: "Accepted",
    className: "bg-status-accepted/10 text-status-accepted",
  },
  [PhaseOneClassification.AUTO_REJECT]: {
    label: "Auto Rejected",
    className: "bg-status-rejected/10 text-status-rejected",
  },
  [PhaseOneClassification.MANUAL_REJECT]: {
    label: "Rejected",
    className: "bg-status-rejected/10 text-status-rejected",
  },
  [PhaseOneClassification.TO_DISCUSS]: {
    label: "To Discuss",
    className: "bg-status-pending/15 text-[color:var(--status-pending)]",
  },
};

export function classificationLabel(c: PhaseOneClassification): string {
  return CLASSIFICATION_STYLES[c].label;
}

// A PENDING row means two different things depending on completeness, and they
// must not look identical:
//   - incomplete applicant → "Pending" (neutral grey): scoring isn't finished.
//   - fully-scored applicant → "Awaiting Review" (primary): the algorithm has
//     ranked them but they fell outside the top N, so a human still has to place
//     them. This is a normal resting state, not an error or an unscored row.
const AWAITING_REVIEW = {
  label: "Awaiting Review",
  className: "bg-primary/10 text-primary",
} as const;

export function ClassificationBadge({
  value,
  complete = false,
}: {
  value: PhaseOneClassification;
  /** Whether the applicant is fully scored — only changes the PENDING label. */
  complete?: boolean;
}) {
  const { label, className } =
    value === PhaseOneClassification.PENDING && complete
      ? AWAITING_REVIEW
      : CLASSIFICATION_STYLES[value];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

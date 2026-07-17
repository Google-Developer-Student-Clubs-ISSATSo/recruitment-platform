import { PhaseOneClassification } from "@/generated/prisma/enums";

// Phase 1 classification → label + Tailwind token classes, mirroring
// applicants/status-badge.tsx. Colours are our status tokens only — the
// to-discuss badge uses status-pending (the yellow already in the palette),
// never a raw orange. Presentational and hook-free, so server or client.
//
// Auto vs. manual share a colour on purpose: green means "this person is in"
// however that was decided. The label carries who decided it.
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
    label: "Auto Accept",
    className: "bg-status-accepted/10 text-status-accepted",
  },
  [PhaseOneClassification.MANUAL_ACCEPT]: {
    label: "Manual Accept",
    className: "bg-status-accepted/10 text-status-accepted",
  },
  [PhaseOneClassification.AUTO_REJECT]: {
    label: "Auto Reject",
    className: "bg-status-rejected/10 text-status-rejected",
  },
  [PhaseOneClassification.MANUAL_REJECT]: {
    label: "Manual Reject",
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

export function ClassificationBadge({ value }: { value: PhaseOneClassification }) {
  const { label, className } = CLASSIFICATION_STYLES[value];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

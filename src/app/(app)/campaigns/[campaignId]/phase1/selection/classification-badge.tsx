"use client";

import { motion } from "motion/react";

import { PhaseOneClassification } from "@/generated/prisma/enums";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";

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

/**
 * The badge re-animates whenever the classification it displays changes.
 *
 * This is the visible receipt for the row-action menu: Accept / Reject / Mark as
 * To Discuss / Revert all take effect through a server action and a revalidation,
 * with no dialog and no toast, so the badge flipping colour is the ONLY thing
 * that tells you the action landed. A scale-and-fade beat makes that flip
 * impossible to miss on a 10-row table where the row you acted on may not be the
 * one you are looking at.
 *
 * `key` covers both inputs, not just `value`: a fully-scored PENDING row reads
 * "Awaiting Review" rather than "Pending", so completeness changes the badge
 * without changing the enum, and that is equally worth animating.
 */
export function ClassificationBadge({
  value,
  complete = false,
}: {
  value: PhaseOneClassification;
  /** Whether the applicant is fully scored — only changes the PENDING label. */
  complete?: boolean;
}) {
  const reduced = useReducedMotion();
  const { label, className } =
    value === PhaseOneClassification.PENDING && complete
      ? AWAITING_REVIEW
      : CLASSIFICATION_STYLES[value];

  return (
    <motion.span
      key={`${value}:${complete}`}
      initial={reduced ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={
        reduced ? { duration: 0 } : { duration: DURATION.fast, ease: EASE.out }
      }
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {label}
    </motion.span>
  );
}

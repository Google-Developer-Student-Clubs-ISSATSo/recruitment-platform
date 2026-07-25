"use client";

import { motion } from "motion/react";

import { ApplicantStatus } from "@/generated/prisma/enums";
import { DURATION, EASE, useReducedMotion } from "@/lib/motion-tokens";

// Applicant status → human label + Tailwind token classes. Colors come from our
// status tokens (status-accepted / status-rejected / status-pending) and
// primary — never raw hex.
const STATUS_STYLES: Record<
  ApplicantStatus,
  { label: string; className: string }
> = {
  [ApplicantStatus.SUBMITTED]: {
    label: "Submitted",
    className:
      "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300",
  },
  [ApplicantStatus.SHORTLISTED]: {
    label: "Shortlisted",
    className: "bg-primary/10 text-primary",
  },
  [ApplicantStatus.REJECTED_PHASE1]: {
    label: "Rejected (Phase 1)",
    className: "bg-status-rejected/10 text-status-rejected",
  },
  [ApplicantStatus.INVITED_GDG_DAY]: {
    label: "Invited — GDG Day",
    className: "bg-primary/10 text-primary",
  },
  [ApplicantStatus.INTERVIEW_SCHEDULED]: {
    label: "Interview Scheduled",
    className:
      "bg-status-pending/15 text-[color:var(--status-pending)]",
  },
  [ApplicantStatus.ACCEPTED]: {
    label: "Accepted",
    className: "bg-status-accepted/10 text-status-accepted",
  },
  [ApplicantStatus.PENDING]: {
    label: "Pending",
    className:
      "bg-status-pending/15 text-[color:var(--status-pending)]",
  },
  [ApplicantStatus.REJECTED_FINAL]: {
    label: "Rejected (Final)",
    className: "bg-status-rejected/10 text-status-rejected",
  },
};

/**
 * The badge pops in whenever the status it is showing changes.
 *
 * `key={status}` is doing the work: React remounts the element when the value
 * differs, which re-runs initial → animate. That means the animation tracks the
 * DATA rather than the render — a row whose status is unchanged after a filter
 * or a page turn stays put, and only a badge that actually reads differently
 * draws the eye. A status here is the outcome of someone's application, so it is
 * worth the 150ms.
 *
 * A scale pop rather than a fade, deliberately: the surrounding rows already
 * fade as a group on a page turn (see <AnimatedTableBody>), so a badge that also
 * faded would disappear into that. Scale reads as a distinct layer.
 */
export function StatusBadge({ status }: { status: ApplicantStatus }) {
  const { label, className } = STATUS_STYLES[status];
  const reduced = useReducedMotion();

  return (
    <motion.span
      key={status}
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

import { ApplicantStatus } from "@/generated/prisma/enums";

// Applicant status → human label + Tailwind token classes. Colors come from our
// status tokens (status-accepted / status-rejected / status-pending) and
// primary — never raw hex. Presentational and hook-free, so it works in server
// or client components.
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

export function StatusBadge({ status }: { status: ApplicantStatus }) {
  const { label, className } = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

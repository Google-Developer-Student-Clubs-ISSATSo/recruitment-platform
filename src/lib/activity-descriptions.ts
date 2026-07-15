// Human-readable rendering of ActivityLogEntry rows, shared by the notification
// bell preview and the activity-log page. Pure functions — safe on client or
// server.

const ACTION_LABELS: Record<string, string> = {
  MAGIC_LINK_REQUESTED: "requested a sign-in link",
  SIGNED_IN: "signed in",
  SIGNED_OUT: "signed out",
  USER_CREATED: "created a member",
  USER_DELETED: "deleted a member",
  PERMISSION_GRANTED: "granted a permission",
  PERMISSION_REVOKED: "revoked a permission",
  PERMISSIONS_RESET: "reset permissions to template defaults",
  ADMIN_TRANSFER_INITIATED: "initiated an admin transfer",
  ADMIN_TRANSFER_CANCELLED: "cancelled an admin transfer",
};

/** "PERMISSION_GRANTED" -> "granted a permission" (falls back to a humanized form). */
export function describeActivity(actionType: string): string {
  return (
    ACTION_LABELS[actionType] ??
    actionType.toLowerCase().replace(/_/g, " ")
  );
}

/** "USER_CREATED" -> "User Created" — the short label shown in the log pill. */
export function actionTypeLabel(actionType: string): string {
  return actionType
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export type ActivityTone =
  | "accepted"
  | "rejected"
  | "pending"
  | "primary"
  | "neutral";

// Colour family for each action's pill, grouped by intent: additive/success is
// green, destructive is red, sensitive/reversible is amber, auth is blue.
const ACTION_TONES: Record<string, ActivityTone> = {
  USER_CREATED: "accepted",
  PERMISSION_GRANTED: "accepted",
  USER_DELETED: "rejected",
  PERMISSION_REVOKED: "rejected",
  PERMISSIONS_RESET: "pending",
  ADMIN_TRANSFER_INITIATED: "pending",
  ADMIN_TRANSFER_CANCELLED: "pending",
  SIGNED_IN: "primary",
  SIGNED_OUT: "primary",
  MAGIC_LINK_REQUESTED: "primary",
};

export function actionTone(actionType: string): ActivityTone {
  return ACTION_TONES[actionType] ?? "neutral";
}

/** Action types that count as security-sensitive for the analytics summary. */
export const SECURITY_ACTION_TYPES = [
  "USER_DELETED",
  "PERMISSION_REVOKED",
  "ADMIN_TRANSFER_INITIATED",
  "ADMIN_TRANSFER_CANCELLED",
];

/** Compact one-line rendering of a log entry's `details` JSON, or "" if none. */
export function formatDetails(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  return Object.values(details as Record<string, unknown>)
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map((v) => String(v))
    .join(" · ");
}

/** A fully-materialised row for the activity-log table. */
export type ActivityLogRow = {
  id: string;
  actorName: string;
  actionType: string;
  createdAtISO: string;
  /** What was acted upon, e.g. "User" — or "—" when not applicable. */
  target: string;
  /** Compact details string (may be empty). */
  details: string;
};

/** Headline numbers for the activity-log analytics cards. */
export type ActivitySummary = {
  actionsToday: number;
  securityEvents: number;
  mostActiveUser: string;
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Split an ISO timestamp into a stable date + time for the table, derived
 * purely from the string (UTC) so server and client render identically — no
 * locale/timezone-driven hydration mismatch.
 */
export function splitTimestamp(iso: string): { date: string; time: string } {
  const [datePart, rest] = iso.split("T");
  const [y, m, d] = datePart.split("-");
  const month = MONTHS[Number(m) - 1] ?? m;
  return {
    date: `${month} ${Number(d)}, ${y}`,
    time: (rest ?? "").slice(0, 8),
  };
}

/** Compact relative time, e.g. "just now", "2m ago", "3h ago", "5d ago". */
export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const secs = Math.max(0, Math.floor(diffMs / 1000));
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** A serialisable activity row shared between server pages and client UI. */
export type ActivityItem = {
  id: string;
  actorName: string;
  actionType: string;
  createdAtISO: string;
};

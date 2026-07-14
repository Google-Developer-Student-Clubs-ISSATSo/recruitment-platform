// Human-readable rendering of ActivityLogEntry rows, shared by the notification
// bell preview and the activity-log page. Pure functions — safe on client or
// server.

const ACTION_LABELS: Record<string, string> = {
  MAGIC_LINK_REQUESTED: "requested a sign-in link",
  SIGNED_IN: "signed in",
  SIGNED_OUT: "signed out",
  USER_CREATED: "created a member",
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

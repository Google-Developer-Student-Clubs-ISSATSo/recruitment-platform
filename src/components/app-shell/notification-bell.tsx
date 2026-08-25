import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import { getNotificationState } from "./notification-actions";

import { NotificationBellMenu } from "./notification-bell-menu";

// Server-side gate + initial data for the top-bar notification bell. Renders
// nothing unless the current user holds VIEW_ACTIVITY_LOG, so the control
// (and the client polling it mounts) is entirely absent for everyone else —
// consistent with the rest of the permission-gated UI.
//
// The gate is checked here, once, so a user without the permission never even
// mounts <NotificationBellMenu> and its poll; getNotificationState() re-checks
// it too, since a Server Action is reachable directly regardless of what
// rendered on the way there.
export async function NotificationBell() {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return null;

  if (!(await hasPermission(userId, PermissionKey.VIEW_ACTIVITY_LOG))) {
    return null;
  }

  const initial = await getNotificationState();

  return (
    <NotificationBellMenu
      initialItems={initial.items}
      initialLastViewedActivityAt={initial.lastViewedActivityAt}
    />
  );
}

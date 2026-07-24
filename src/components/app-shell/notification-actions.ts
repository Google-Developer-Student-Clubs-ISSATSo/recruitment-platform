"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Mark the notification feed as seen for the current user — stamps
 * lastViewedActivityAt to now, which is what clears the bell's unread dot. Called
 * when the user opens the notification popover. Best-effort and silent: a failure
 * here should never surface as an error in the top bar, it just means the dot
 * lingers until the next open.
 */
export async function markActivityViewed(): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;

  await prisma.user.update({
    where: { id: userId },
    data: { lastViewedActivityAt: new Date() },
  });
}

import { getSession } from "@/lib/session";
import { getSeatApprovalsAwaiting } from "@/lib/seat-approval-inbox";
import { SeatApprovalDialog } from "./seat-approval-dialog";

/**
 * Checks, on every navigation inside the app shell, whether this user has a
 * panel seat request waiting on them — and if so, puts it in front of them.
 *
 * The check is a single query that returns nothing for almost everybody (see
 * {@link getSeatApprovalsAwaiting}); only a lead with something genuinely
 * pending pays for the live approver resolution behind it. That is the whole
 * mechanism: no polling, no email, no token — just a cheap read on a page load
 * the user was making anyway.
 */
export async function SeatApprovalPrompt() {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return null;

  const items = await getSeatApprovalsAwaiting(userId);
  if (items.length === 0) return null;

  return <SeatApprovalDialog items={items} />;
}

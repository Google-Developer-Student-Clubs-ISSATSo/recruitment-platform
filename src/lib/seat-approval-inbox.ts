import { prisma } from "@/lib/prisma";
import { resolveSeatApprover } from "@/lib/panel-authority";
import { seatKindLabel } from "@/lib/panel-seat-kind";
import { ApprovalStatus } from "@/generated/prisma/enums";

// What a lead is being asked to answer, right now.
//
// There is no email and no token behind this: a request reaches its approver by
// them being signed in and it being theirs to answer. That means the question
// "is this yours?" has to be asked at read time, live, exactly as the write path
// asks it — which is what makes the inbox and the action agree even when a lead
// title changed while the request sat waiting.

export type SeatApprovalItem = {
  requestId: string;
  campaignId: string;
  campaignName: string;
  applicantName: string;
  seatKindLabel: string;
  requestedByName: string;
  assigneeName: string;
  /** True when the requester asked for the seat for themselves. */
  forSelf: boolean;
};

/**
 * Every pending seat request this user is the CURRENT approver for.
 *
 * Deliberately not driven by the stored `approverUserId`: that column records
 * who was asked when the request was raised, and a lead reassignment since then
 * moves the answer to whoever holds the title now. The stored value would show
 * an outgoing lead a prompt they can no longer act on, and hide it from the
 * incoming one who can.
 *
 * MANAGE_ACCOUNTS is not honoured here, though it *is* honoured by the action
 * that answers a request. The override exists so the Administrator can unblock
 * a stuck request; it isn't a reason to interrupt them with a modal for every
 * request in the club.
 *
 * Cheap in the common case, which is the point — this runs on every navigation.
 * No pending rows anywhere means one query and an immediate empty return; the
 * live resolution below only happens when there is something to resolve.
 */
export async function getSeatApprovalsAwaiting(
  userId: string,
): Promise<SeatApprovalItem[]> {
  const pending = await prisma.panelSeatApprovalRequest.findMany({
    where: {
      status: ApprovalStatus.PENDING,
      // A filled seat's request is moot; assignment declines those, but a
      // request raised against a seat someone else filled first would linger.
      seat: { claimedById: null },
    },
    select: {
      id: true,
      requestedById: true,
      requestedBy: { select: { name: true, email: true } },
      assignee: { select: { name: true, email: true } },
      seat: {
        select: {
          kind: true,
          panel: {
            select: {
              applicant: {
                select: {
                  fullName: true,
                  campaignId: true,
                  campaign: { select: { name: true } },
                  // A closed note freezes the panel, so its requests can no
                  // longer be acted on — don't prompt for them.
                  interviewNote: { select: { closedAt: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return [];

  const items: SeatApprovalItem[] = [];
  // One resolution per campaign, not per request: a lead answering several
  // requests on the same campaign is the normal case.
  const approverByCampaignKind = new Map<string, string | null>();

  for (const request of pending) {
    const applicant = request.seat.panel.applicant;
    if (applicant.interviewNote?.closedAt != null) continue;

    const key = `${applicant.campaignId}:${request.seat.kind}`;
    if (!approverByCampaignKind.has(key)) {
      approverByCampaignKind.set(
        key,
        await resolveSeatApprover(applicant.campaignId, request.seat.kind),
      );
    }
    if (approverByCampaignKind.get(key) !== userId) continue;

    const requestedByName =
      request.requestedBy.name ?? request.requestedBy.email;
    // A request with no assignee predates asking on someone else's behalf, and
    // meant the requester themselves — the same fallback the board uses.
    const assigneeName =
      request.assignee?.name ?? request.assignee?.email ?? requestedByName;

    items.push({
      requestId: request.id,
      campaignId: applicant.campaignId,
      campaignName: applicant.campaign.name,
      applicantName: applicant.fullName,
      seatKindLabel: seatKindLabel(request.seat.kind),
      requestedByName,
      assigneeName,
      forSelf: assigneeName === requestedByName,
    });
  }

  return items;
}

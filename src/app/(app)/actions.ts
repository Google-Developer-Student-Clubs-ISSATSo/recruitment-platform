"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { respondToSeatApproval, type SeatResult } from "@/lib/panel-seat";

// Actions reachable from the shell itself rather than from one page — currently
// just answering a seat request, which the approval prompt raises wherever its
// approver happens to be in the app.

/**
 * Approve or decline a pending seat request from the shell-level prompt.
 *
 * The campaign is derived from the request rather than taken from the caller:
 * the prompt isn't campaign-scoped, and the request already knows which
 * campaign it belongs to. Nothing rests on that value anyway — who may answer
 * is re-derived live inside {@link respondToSeatApproval}, from the current
 * lead holders, and that check is the boundary.
 */
export async function answerSeatApprovalAction(
  requestId: string,
  approve: boolean,
): Promise<SeatResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You are signed out." };

  const request = await prisma.panelSeatApprovalRequest.findUnique({
    where: { id: requestId },
    select: {
      seat: {
        select: {
          panel: { select: { applicant: { select: { campaignId: true } } } },
        },
      },
    },
  });
  if (!request) return { ok: false, error: "That request no longer exists." };

  const campaignId = request.seat.panel.applicant.campaignId;
  const result = await respondToSeatApproval(
    campaignId,
    requestId,
    approve,
    userId,
  );
  if (!result.ok) return result;

  revalidatePath(`/campaigns/${campaignId}/interviews`);
  return { ok: true };
}

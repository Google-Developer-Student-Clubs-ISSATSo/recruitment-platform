import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type LogActivityInput = {
  /** The existing User who performed the action. Always required. */
  actorId: string;
  /** A stable, uppercase verb describing what happened, e.g. "SIGNED_IN". */
  actionType: string;
  /** Optional kind of thing acted upon, e.g. "Applicant", "Campaign". */
  targetType?: string;
  /** Optional id of the thing acted upon. */
  targetId?: string;
  /**
   * The campaign this action belongs to, for actions that are inherently
   * campaign-scoped (Phase 1 scoring, interview notes, campaign email
   * batches, etc.). Omit entirely for genuinely global actions (account
   * creation, permission grants, admin transfer) — never pass one just
   * because the caller happens to be running inside a campaign page.
   */
  campaignId?: string;
  /** Optional structured context (kept generic on purpose). */
  details?: Prisma.InputJsonValue;
};

/**
 * The log write as an unawaited Prisma promise, so it can be handed to the array
 * form of `prisma.$transaction([...])` alongside the writes it describes.
 *
 * This exists for one case: an action that deletes the very rows the log lives
 * in (deleting a campaign cascades its scoped entries). There the entry proving
 * the deletion happened has to land in the SAME transaction as the delete, or a
 * rollback leaves a log entry for a deletion that never happened — or worse, a
 * completed deletion with no record of it. Everything else should call
 * {@link logActivity}.
 */
export function activityLogWrite({
  actorId,
  actionType,
  targetType,
  targetId,
  campaignId,
  details,
}: LogActivityInput) {
  return prisma.activityLogEntry.create({
    data: {
      actorId,
      actionType,
      targetType,
      targetId,
      campaignId,
      details,
    },
  });
}

export async function logActivity(input: LogActivityInput) {
  return activityLogWrite(input);
}

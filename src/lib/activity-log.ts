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
  /** Optional structured context (kept generic on purpose). */
  details?: Prisma.InputJsonValue;
};

export async function logActivity({
  actorId,
  actionType,
  targetType,
  targetId,
  details,
}: LogActivityInput) {
  return prisma.activityLogEntry.create({
    data: {
      actorId,
      actionType,
      targetType,
      targetId,
      details,
    },
  });
}

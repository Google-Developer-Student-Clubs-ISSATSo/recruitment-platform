import { prisma } from "@/lib/prisma";
import { PermissionKey, RoleTemplateName } from "@/generated/prisma/enums";

/**
 * Wipe a user's UserPermission rows and recreate them from their CURRENTLY
 * stored roleTemplateId — i.e. make their real permissions match whatever
 * template they are presently assigned to. Not "use server" because it is
 * called from both a server action (admin/permissions/actions.ts'
 * resetToTemplate, after its own requirePermission/assertNotLead checks) and
 * a plain Node script (a one-off roleTemplateId correction, which has no
 * request/session to check permissions against) — callers are responsible for
 * authorization, this only does the sync.
 *
 * Returns the template name synced to, or null if the user (or their
 * template) no longer exists.
 */
export async function syncPermissionsToTemplate(
  userId: string,
  actorId: string,
): Promise<RoleTemplateName | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      roleTemplate: {
        select: {
          name: true,
          permissions: { select: { permission: true } },
        },
      },
    },
  });
  const template = user?.roleTemplate;
  if (!template) return null;

  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId } }),
    prisma.userPermission.createMany({
      data: template.permissions.map((p: { permission: PermissionKey }) => ({
        userId,
        permission: p.permission,
        grantedBy: actorId,
      })),
    }),
  ]);

  return template.name;
}

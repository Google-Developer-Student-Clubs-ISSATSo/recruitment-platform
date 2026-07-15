import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  Committee,
  PermissionKey,
  RoleTemplateName,
} from "@/generated/prisma/enums";

import {
  COMMITTEES,
  ROLE_TEMPLATE_LABELS,
  type AdminUserRow,
  type TemplateOption,
} from "./permission-config";
import { PermissionTable } from "./permission-table";

type PermRow = { permission: PermissionKey };
type UserQueryRow = {
  id: string;
  name: string | null;
  email: string;
  committee: Committee;
  permissions: PermRow[];
  roleTemplate: {
    name: RoleTemplateName;
    permissions: PermRow[];
  } | null;
};

/** True when two permission sets contain exactly the same keys. */
function samePermissions(a: PermissionKey[], b: PermissionKey[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((p) => set.has(p));
}

// Access is guarded once in the /admin layout (MANAGE_ACCOUNTS); this page no
// longer repeats that check.
export default async function PermissionsPage() {
  const session = await auth();
  const currentUserId = session?.user?.id ?? "";

  const [users, templates] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      include: {
        permissions: { select: { permission: true } },
        roleTemplate: {
          select: {
            name: true,
            permissions: { select: { permission: true } },
          },
        },
      },
    }),
    prisma.roleTemplate.findMany({ select: { name: true } }),
  ]);

  const rows: AdminUserRow[] = users.map((u: UserQueryRow) => {
    const permissions = u.permissions.map((p) => p.permission);
    // The user's OWN assigned template is the reference. (Defensive fallback
    // to Committee Representative only if a legacy row has none.)
    const templateName = u.roleTemplate?.name ?? RoleTemplateName.COMMITTEE_REPRESENTATIVE;
    const templatePerms = u.roleTemplate?.permissions.map((p) => p.permission) ?? [];
    const isCustom = !samePermissions(permissions, templatePerms);

    return {
      id: u.id,
      name: u.name ?? "(no name)",
      email: u.email,
      committee: u.committee,
      templateName,
      templateLabel: ROLE_TEMPLATE_LABELS[templateName],
      isCustom,
      permissions,
    };
  });

  const committeeOrder = new Map(COMMITTEES.map((c, i) => [c, i]));
  const isLead = (r: AdminUserRow) => r.templateName === RoleTemplateName.TM_LEAD;
  const leads = rows.filter(isLead);
  const members = rows
    .filter((r) => !isLead(r))
    .sort((a, b) => {
      const byCommittee =
        (committeeOrder.get(a.committee) ?? 0) -
        (committeeOrder.get(b.committee) ?? 0);
      return byCommittee !== 0 ? byCommittee : a.name.localeCompare(b.name);
    });

  const templateOptions: TemplateOption[] = templates.map(
    (t: { name: RoleTemplateName }) => ({
      name: t.name,
      label: ROLE_TEMPLATE_LABELS[t.name],
    }),
  );

  return (
    <PermissionTable
      leads={leads}
      members={members}
      templates={templateOptions}
      committees={COMMITTEES}
      currentUserId={currentUserId}
    />
  );
}

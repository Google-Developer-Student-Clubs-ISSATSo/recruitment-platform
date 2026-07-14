import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import {
  Committee,
  PermissionKey,
  RoleTemplateName,
} from "@/generated/prisma/enums";

import {
  COMMITTEES,
  ROLE_TEMPLATE_LABELS,
  type AdminUserRow,
  type PendingInviteRow,
  type TemplateOption,
} from "./permission-config";
import { PermissionTable } from "./permission-table";
import { AdminShell } from "../admin-shell";
import { InviteStatus } from "@/generated/prisma/enums";

type PermRow = { permission: PermissionKey };
type InviteQueryRow = {
  id: string;
  name: string;
  email: string;
  committee: Committee;
  createdAt: Date;
  roleTemplate: { name: RoleTemplateName };
};
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

export default async function PermissionsPage() {
  const actorId = await requirePermission(PermissionKey.MANAGE_ACCOUNTS);

  const [users, templates, invites] = await Promise.all([
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
    prisma.userInvite.findMany({
      where: { status: InviteStatus.PENDING },
      orderBy: { createdAt: "desc" },
      include: { roleTemplate: { select: { name: true } } },
    }),
  ]);

  const pendingInvites: PendingInviteRow[] = invites.map((i: InviteQueryRow) => ({
    id: i.id,
    name: i.name,
    email: i.email,
    committee: i.committee,
    templateLabel: ROLE_TEMPLATE_LABELS[i.roleTemplate.name],
    createdAtISO: i.createdAt.toISOString(),
  }));

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

  const me = rows.find((r) => r.id === actorId);
  const currentUserName = me?.name ?? "Admin";
  const currentUserSubtitle = me
    ? `${me.isCustom ? `${me.templateLabel} Custom` : me.templateLabel} · ${me.committee}`
    : "Administrator";
  const canManageAccounts = me
    ? me.permissions.includes(PermissionKey.MANAGE_ACCOUNTS)
    : true;

  return (
    <AdminShell
      userName={currentUserName}
      userSubtitle={currentUserSubtitle}
      canManageAccounts={canManageAccounts}
    >
      <PermissionTable
        leads={leads}
        members={members}
        pendingInvites={pendingInvites}
        templates={templateOptions}
        committees={COMMITTEES}
      />
    </AdminShell>
  );
}

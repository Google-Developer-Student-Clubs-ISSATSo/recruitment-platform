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
  type TemplateOption,
} from "./permission-config";
import { PermissionTable } from "./permission-table";

type TemplateKeys = { name: RoleTemplateName; keys: Set<PermissionKey> };

// Shapes of the Prisma `select`ed rows, annotated explicitly so the code does
// not depend on the editor resolving the generated client's deep inference.
type PermissionRow = { permission: PermissionKey; committee: Committee | null };
type TemplatePermRow = { permission: PermissionKey };
type TemplateQueryRow = { name: RoleTemplateName; permissions: TemplatePermRow[] };
type UserQueryRow = {
  id: string;
  name: string | null;
  email: string;
  permissions: PermissionRow[];
};

function inferTemplates(
  userKeys: Set<PermissionKey>,
  templates: TemplateKeys[],
): { exact: RoleTemplateName | null; closest: RoleTemplateName } {
  let exact: RoleTemplateName | null = null;
  let closest = templates[0]?.name ?? RoleTemplateName.INTERVIEWER;
  let bestScore = -1;
  let bestSize = Infinity;

  for (const t of templates) {
    let inter = 0;
    for (const key of userKeys) if (t.keys.has(key)) inter += 1;

    if (t.keys.size === userKeys.size && inter === userKeys.size)
      exact = t.name;

    const union = userKeys.size + t.keys.size - inter;
    const score = union === 0 ? 0 : inter / union;
    if (score > bestScore || (score === bestScore && t.keys.size < bestSize)) {
      bestScore = score;
      bestSize = t.keys.size;
      closest = t.name;
    }
  }
  return { exact, closest };
}

export default async function PermissionsPage() {
  await requirePermission(PermissionKey.MANAGE_ACCOUNTS);

  const [users, templates] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      include: {
        permissions: { select: { permission: true, committee: true } },
      },
    }),
    prisma.roleTemplate.findMany({
      include: { permissions: { select: { permission: true } } },
    }),
  ]);

  const templateKeys: TemplateKeys[] = templates.map((t: TemplateQueryRow) => ({
    name: t.name,
    keys: new Set(t.permissions.map((p: TemplatePermRow) => p.permission)),
  }));

  const rows: AdminUserRow[] = users.map((u: UserQueryRow) => {
    const userKeys = new Set(
      u.permissions.map((p: PermissionRow) => p.permission),
    );
    const { exact, closest } = inferTemplates(userKeys, templateKeys);

    const held = new Set(
      u.permissions
        .map((p: PermissionRow) => p.committee)
        .filter((c): c is Committee => c !== null),
    );
    const committees = COMMITTEES.filter((c) => held.has(c));

    return {
      id: u.id,
      name: u.name ?? "(no name)",
      email: u.email,
      badgeLabel: exact ? ROLE_TEMPLATE_LABELS[exact] : "Custom",
      isExactTemplate: exact !== null,
      closestTemplate: closest,
      committees,
      permissions: u.permissions.map((p: PermissionRow) => ({
        permission: p.permission,
        committee: p.committee,
      })),
    };
  });

  const templateOptions: TemplateOption[] = templateKeys.map((t) => ({
    name: t.name,
    label: ROLE_TEMPLATE_LABELS[t.name],
  }));

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <PermissionTable users={rows} templates={templateOptions} />
      </div>
    </main>
  );
}

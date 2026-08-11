import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  Committee,
  PermissionKey,
  RoleTemplateName,
} from "@/generated/prisma/enums";

import { getLeadRolesByUser } from "@/lib/identity-color-store";
import { resolveIdentityColor } from "@/lib/identity-color";
import { resolvePrimaryRole } from "@/lib/primary-role";

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

/** Members per page. Matches the activity log and applicants list. */
const PAGE_SIZE = 10;

function asEnum<T extends Record<string, string>>(
  e: T,
  value: string | undefined,
): T[keyof T] | null {
  if (!value) return null;
  return (Object.values(e) as string[]).includes(value)
    ? (value as T[keyof T])
    : null;
}

// Access is guarded once in the /admin layout (MANAGE_ACCOUNTS); this page no
// longer repeats that check.
//
// Search and filters live in the URL and are applied in the database, because
// the member table is a paginated slice — filtering it in the browser would only
// ever filter the ten rows on screen, and "select all matching" has to be able
// to reach members on pages you have never visited.
export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    committee?: string;
    template?: string;
  }>;
}) {
  const session = await getSession();
  const currentUserId = session?.user?.id ?? "";

  const sp = await searchParams;
  const requestedPage = Math.max(1, Number(sp.page) || 1);
  const query = sp.q?.trim() ?? "";
  const committee = asEnum(Committee, sp.committee);
  const template = asEnum(RoleTemplateName, sp.template);

  const include = {
    permissions: { select: { permission: true } },
    roleTemplate: {
      select: { name: true, permissions: { select: { permission: true } } },
    },
  } as const;

  // Shared by the member list, its count, and the select-all id query, so all
  // three always describe the same set.
  // Composed with AND rather than spread into one object: both the lead
  // exclusion and the template filter are `roleTemplate` conditions, so
  // spreading would let the second silently replace the first and readmit the
  // TM Lead into the member list — and therefore into bulk selection.
  const memberWhere = {
    AND: [
      // The TM Lead has its own section and is never part of the paginated
      // member list, nor of any bulk action.
      { roleTemplate: { isNot: { name: RoleTemplateName.TM_LEAD } } },
      ...(template ? [{ roleTemplate: { is: { name: template } } }] : []),
      ...(committee ? [{ committee }] : []),
      ...(query
        ? [
            {
              OR: [
                { name: { contains: query, mode: "insensitive" as const } },
                { email: { contains: query, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };

  const [
    leadUsers,
    memberUsers,
    matchingCount,
    matchingIdRows,
    statsUsers,
    templates,
    leadRolesByUser,
    committeeGroups,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { roleTemplate: { is: { name: RoleTemplateName.TM_LEAD } } },
      orderBy: { name: "asc" },
      include,
    }),
    // COMMITTEES is declared in the same order as the Postgres enum, so ordering
    // by the column reproduces the grouped-by-committee reading order the list
    // had when it was sorted in JS — and, unlike a JS sort, it survives paging.
    prisma.user.findMany({
      where: memberWhere,
      orderBy: [{ committee: "asc" }, { name: "asc" }],
      skip: (requestedPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include,
    }),
    prisma.user.count({ where: memberWhere }),
    // Ids only — this is what "Select all N matching" selects, so it must span
    // every page, not just the one rendered.
    prisma.user.findMany({
      where: memberWhere,
      orderBy: [{ committee: "asc" }, { name: "asc" }],
      select: { id: true },
    }),
    // Stat cards are totals over everyone, unaffected by filters or paging.
    prisma.user.findMany({
      select: {
        permissions: { select: { permission: true } },
        roleTemplate: { select: { permissions: { select: { permission: true } } } },
      },
    }),
    // TM_LEAD is excluded here, not filtered downstream: there is exactly one
    // Administrator at a time, appointed only via Transfer Admin Role, so the
    // Create User template list must structurally never be able to offer it.
    prisma.roleTemplate.findMany({
      where: { name: { not: RoleTemplateName.TM_LEAD } },
      select: { name: true },
    }),
    // No campaign is in scope on this screen, so lead titles are gathered
    // across every OPEN campaign — a Club Lead of the running cycle should
    // still read as one here.
    getLeadRolesByUser(),
    // Members per committee. Counted in the DATABASE rather than off any list
    // above: `memberUsers` is one page of ten and excludes the TM Lead, so
    // tallying it would report whatever happens to be on screen. This groups
    // over every user, which is what makes the three cards sum exactly to
    // Total Members (the Administrator included — they hold a committee like
    // anyone else).
    prisma.user.groupBy({
      by: ["committee"],
      _count: { _all: true },
    }),
  ]);

  const toRow = (u: UserQueryRow): AdminUserRow => {
    const permissions = u.permissions.map((p) => p.permission);
    // The user's OWN assigned template is the reference. (Defensive fallback
    // to Committee Representative only if a legacy row has none.)
    const templateName = u.roleTemplate?.name ?? RoleTemplateName.COMMITTEE_REPRESENTATIVE;
    const templatePerms = u.roleTemplate?.permissions.map((p) => p.permission) ?? [];
    const isCustom = !samePermissions(permissions, templatePerms);
    const templateLabel = ROLE_TEMPLATE_LABELS[templateName];
    const leadRoles = leadRolesByUser.get(u.id) ?? [];
    const primaryRole = resolvePrimaryRole({ templateLabel, leadRoles });

    return {
      id: u.id,
      name: u.name ?? "(no name)",
      email: u.email,
      committee: u.committee,
      templateName,
      templateLabel,
      isCustom,
      permissions,
      identityColor: resolveIdentityColor({ committee: u.committee, leadRoles }),
      primaryRoleLabel: primaryRole.label,
      primaryRoleIsCustom: primaryRole.isTemplateDerived && isCustom,
    };
  };

  const leads = leadUsers.map(toRow);
  const members = memberUsers.map(toRow);

  const customizedCount = statsUsers.filter((u) => {
    const perms = u.permissions.map((p) => p.permission);
    const templatePerms = u.roleTemplate?.permissions.map((p) => p.permission) ?? [];
    return !samePermissions(perms, templatePerms);
  }).length;

  const templateOptions: TemplateOption[] = templates.map(
    (t: { name: RoleTemplateName }) => ({
      name: t.name,
      label: ROLE_TEMPLATE_LABELS[t.name],
    }),
  );

  // Seeded from COMMITTEES so a committee with no members still renders as 0
  // rather than vanishing — an absent card would read as "no such committee".
  const committeeCounts = Object.fromEntries(
    COMMITTEES.map((c) => [c, 0]),
  ) as Record<Committee, number>;
  for (const group of committeeGroups) {
    committeeCounts[group.committee] = group._count._all;
  }

  const pageCount = Math.max(1, Math.ceil(matchingCount / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  return (
    <PermissionTable
      leads={leads}
      members={members}
      templates={templateOptions}
      committees={COMMITTEES}
      currentUserId={currentUserId}
      totalMembers={statsUsers.length}
      customizedCount={customizedCount}
      committeeCounts={committeeCounts}
      matchingCount={matchingCount}
      matchingIds={matchingIdRows.map((r) => r.id)}
      page={page}
      pageCount={pageCount}
      pageSize={PAGE_SIZE}
      filters={{
        q: query,
        committee: sp.committee ?? "",
        template: sp.template ?? "",
      }}
    />
  );
}

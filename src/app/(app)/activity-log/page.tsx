import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { PermissionKey } from "@/generated/prisma/enums";
import {
  formatDetails,
  SECURITY_ACTION_TYPES,
  type ActivityLogRow,
  type ActivitySummary,
} from "@/lib/activity-descriptions";

import { ActivityLogList } from "./activity-log-list";

type EntryRow = {
  id: string;
  actionType: string;
  targetType: string | null;
  details: unknown;
  createdAt: Date;
  actor: { name: string | null } | null;
};

// A top-level, platform-wide route (NOT under /admin). It carries its own
// VIEW_ACTIVITY_LOG guard, independent of the /admin MANAGE_ACCOUNTS gate — so
// a user granted only VIEW_ACTIVITY_LOG can reach it. The shell comes from the
// (app) layout.
/** Entries per page. The log grows without bound, so it is never fetched whole. */
const PAGE_SIZE = 10;

/** A calendar date string (yyyy-mm-dd) from an <input type="date">, or null. */
function parseDate(value: string | undefined, endOfDay: boolean): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(endOfDay ? `${value}T23:59:59.999` : `${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    actor?: string;
    action?: string;
    campaign?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const userId = await requirePermission(PermissionKey.VIEW_ACTIVITY_LOG);

  // Reading the log and destroying it are separate bars. VIEW_ACTIVITY_LOG gets
  // a member onto this page; deleting history is the Administrator's alone, the
  // same MANAGE_ACCOUNTS gate used by /admin and the transfer flow. The actions
  // re-check it server-side — this only decides whether the controls render.
  const canDeleteLogs = await hasPermission(userId, PermissionKey.MANAGE_ACCOUNTS);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const params = await searchParams;

  // Clamped below once the real filtered total is known; parsed defensively here
  // so a hand-edited ?page=abc or ?page=-3 can't produce a negative skip.
  const requestedPage = Math.max(1, Number(params.page) || 1);

  const actorId = params.actor?.trim() || null;
  const actionType = params.action?.trim() || null;
  const campaignId = params.campaign?.trim() || null;
  const from = parseDate(params.from, false);
  // Inclusive: filtering "to 2026-07-18" must include everything logged that
  // day, so the bound is the end of it rather than midnight at its start.
  const to = parseDate(params.to, true);

  // The one `where` used by BOTH the page query and the count that derives
  // pageCount. Building it once is what keeps the two from disagreeing — a
  // filtered list paired with an unfiltered total would page into empty results.
  //
  // Filtering to a campaign shows that campaign's scoped entries PLUS every
  // global entry (campaignId null) — a global action (a permission grant, an
  // admin transfer) isn't "about" any campaign, so it can't be excluded by
  // picking one; it stays visible under every filter value.
  const where = {
    ...(actorId ? { actorId } : {}),
    ...(actionType ? { actionType } : {}),
    ...(campaignId ? { OR: [{ campaignId }, { campaignId: null }] } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };

  // One wave, not three. These are all independent of each other, so awaiting
  // the filter-option queries separately afterwards just added a second round
  // trip to Neon for no reason — and the "most active user" name used to cost a
  // third, even though `actors` below already carries every id/name pair it
  // could resolve to.
  const [
    entries,
    total,
    actionsToday,
    securityEvents,
    mostActiveGroup,
    distinctActions,
    actors,
    loggedCampaignIds,
  ] = await Promise.all([
      prisma.activityLogEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (requestedPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { actor: { select: { name: true } } },
      }),
      prisma.activityLogEntry.count({ where }),
      prisma.activityLogEntry.count({
        where: { createdAt: { gte: startOfToday } },
      }),
      prisma.activityLogEntry.count({
        where: { actionType: { in: SECURITY_ACTION_TYPES } },
      }),
      prisma.activityLogEntry.groupBy({
        by: ["actorId"],
        _count: { actorId: true },
        orderBy: { _count: { actorId: "desc" } },
        take: 1,
      }),
      // Filter options describe the WHOLE log, not the ten rows on this page and
      // not the current filter — deriving them from `entries` would make the
      // dropdowns change contents as you page, and deriving them from the
      // filtered set would strand you on a selection you couldn't undo.
      prisma.activityLogEntry.findMany({
        distinct: ["actionType"],
        select: { actionType: true },
        orderBy: { actionType: "asc" },
      }),
      // Filtering is by id, not name: two members can share a display name, and
      // an id survives a rename.
      prisma.user.findMany({
        where: { activityLogs: { some: {} } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      // Which campaigns have ANY scoped entry, independent of the current
      // filter — same reasoning as distinctActions above. campaignId has no FK
      // relation (entries must survive a deleted campaign), so this is a bare
      // scalar distinct, resolved to names in a second, dependent query below.
      prisma.activityLogEntry.findMany({
        where: { campaignId: { not: null } },
        distinct: ["campaignId"],
        select: { campaignId: true },
      }),
    ]);

  // Dependent on loggedCampaignIds, so it can't join the wave above. A deleted
  // campaign's id can appear here with no matching row — its entries still
  // exist (by design, see the schema comment on ActivityLogEntry.campaignId),
  // so the dropdown falls back to a label rather than silently dropping it.
  const campaignNames = await prisma.campaign.findMany({
    where: { id: { in: loggedCampaignIds.map((c) => c.campaignId!) } },
    select: { id: true, name: true },
  });
  const campaignOptions = loggedCampaignIds
    .map((c) => ({
      id: c.campaignId!,
      name: campaignNames.find((n) => n.id === c.campaignId)?.name ?? "Deleted campaign",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows: ActivityLogRow[] = entries.map((e: EntryRow) => ({
    id: e.id,
    actorName: e.actor?.name ?? "Someone",
    actionType: e.actionType,
    createdAtISO: e.createdAt.toISOString(),
    target: e.targetType ?? "—",
    details: formatDetails(e.details),
  }));

  // Resolved from `actors`, which is every user who has ever logged an entry —
  // so the top actor is necessarily in it. That makes the extra findUnique this
  // used to run pure overhead.
  const topActorId = mostActiveGroup[0]?.actorId;
  const mostActiveUser =
    (topActorId ? actors.find((a) => a.id === topActorId)?.name : null) ?? "—";

  const summary: ActivitySummary = {
    actionsToday,
    securityEvents,
    mostActiveUser,
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  return (
    <ActivityLogList
      rows={rows}
      total={total}
      summary={summary}
      page={page}
      pageCount={pageCount}
      pageSize={PAGE_SIZE}
      actorOptions={actors.map((a) => ({ id: a.id, name: a.name ?? "Unnamed" }))}
      actionOptions={distinctActions.map((a) => a.actionType)}
      campaignOptions={campaignOptions}
      canDeleteLogs={canDeleteLogs}
      // Resolved from the options the page already built, so the delete dialog
      // can name the campaign it is about to clear — including a deleted one,
      // which falls back to the same label the filter dropdown shows.
      selectedCampaign={
        campaignId
          ? campaignOptions.find((c) => c.id === campaignId) ?? {
              id: campaignId,
              name: "Deleted campaign",
            }
          : null
      }
      filters={{
        actor: actorId ?? "",
        action: actionType ?? "",
        campaign: campaignId ?? "",
        from: params.from ?? "",
        to: params.to ?? "",
      }}
    />
  );
}

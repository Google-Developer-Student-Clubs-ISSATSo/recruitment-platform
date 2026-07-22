import { prisma } from "@/lib/prisma";
import { ApplicantStatus } from "@/generated/prisma/enums";
import {
  CAPACITY_COMMITTEES,
  sanitizeTarget,
  type CapacityTargets,
} from "@/lib/committee-capacity";
import type { CommitteeUsage } from "@/lib/final-decision";

// Server-only persistence for committee capacity. Split from
// committee-capacity.ts so the pure helpers there stay importable from client
// components without pulling prisma into the browser bundle.

/**
 * Read the campaign's configured targets as a complete map.
 *
 * A committee with no CommitteeCapacity row yet reads as 0 rather than being
 * absent, so callers — the config form, and the Final Decision dashboard next —
 * never have to distinguish "not configured" from "zero seats". Both mean the
 * same thing to a dashboard counting seats against a target.
 */
export async function getCapacityTargets(
  campaignId: string,
): Promise<CapacityTargets> {
  const rows = await prisma.committeeCapacity.findMany({
    where: { campaignId },
    select: { committee: true, target: true },
  });

  const targets = Object.fromEntries(
    CAPACITY_COMMITTEES.map((committee) => [committee, 0]),
  ) as CapacityTargets;

  for (const row of rows) targets[row.committee] = row.target;
  return targets;
}

/**
 * Live seat usage per committee: how many applicants are ACCEPTED into it right
 * now, against its configured target.
 *
 * The accepted count is COUNTED, never read from a stored column — the schema
 * comment on CommitteeCapacity says so deliberately. Every caller gets the truth
 * as of this query, so a decision recorded a moment ago is already reflected and
 * no counter can drift out of sync with the applicant rows it describes.
 */
export async function getCapacityUsage(
  campaignId: string,
): Promise<CommitteeUsage[]> {
  const [targets, grouped] = await Promise.all([
    getCapacityTargets(campaignId),
    prisma.applicant.groupBy({
      by: ["assignedCommittee"],
      where: { campaignId, status: ApplicantStatus.ACCEPTED },
      _count: { _all: true },
    }),
  ]);

  const accepted = new Map(
    grouped
      .filter((g) => g.assignedCommittee !== null)
      .map((g) => [g.assignedCommittee!, g._count._all]),
  );

  return CAPACITY_COMMITTEES.map((committee) => ({
    committee,
    accepted: accepted.get(committee) ?? 0,
    target: targets[committee],
  }));
}

/**
 * Upsert all three CommitteeCapacity rows for the campaign in one transaction,
 * so the saved set is never half-old/half-new — the total seats figure the
 * dashboard reads would be meaningless mid-write otherwise. Returns the values
 * actually stored, which may differ from the input where sanitizing changed one.
 *
 * Authorization is the caller's job — this assumes the caller may edit capacity.
 */
export async function saveCapacityTargets(
  campaignId: string,
  targets: CapacityTargets,
): Promise<CapacityTargets> {
  const clean = Object.fromEntries(
    CAPACITY_COMMITTEES.map((committee) => [
      committee,
      sanitizeTarget(targets[committee]),
    ]),
  ) as CapacityTargets;

  await prisma.$transaction(
    CAPACITY_COMMITTEES.map((committee) =>
      prisma.committeeCapacity.upsert({
        where: { campaignId_committee: { campaignId, committee } },
        create: { campaignId, committee, target: clean[committee] },
        update: { target: clean[committee] },
      }),
    ),
  );

  return clean;
}

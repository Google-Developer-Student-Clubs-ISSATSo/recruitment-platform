import { prisma } from "@/lib/prisma";
import { PanelSeatKind } from "@/generated/prisma/enums";
import {
  DEFAULT_PANEL_SIZE,
  isPanelSize,
  seatKindsForPanelSize,
  type PanelSize,
} from "@/lib/panel-size";

// Per-campaign interview settings — currently just the panel size, which decides
// how many seats `ensurePanel` creates and therefore what the board shows.
//
// The size vocabulary itself lives in panel-size.ts, deliberately apart from
// this module: the setting's form is a client component and cannot import
// anything that reaches the database.

/**
 * This campaign's panel size, defaulted when no InterviewConfig row exists yet.
 * A campaign that never visits the setting behaves exactly as it did before the
 * setting existed.
 */
export async function getPanelSize(campaignId: string): Promise<PanelSize> {
  const config = await prisma.interviewConfig.findUnique({
    where: { campaignId },
    select: { panelSize: true },
  });
  const stored = config?.panelSize;
  return stored != null && isPanelSize(stored) ? stored : DEFAULT_PANEL_SIZE;
}

/** The seat kinds this campaign's panels should have. */
export async function getSeatKindsFor(
  campaignId: string,
): Promise<readonly PanelSeatKind[]> {
  return seatKindsForPanelSize(await getPanelSize(campaignId));
}

/**
 * Save the panel size. Upserts, mirroring PhaseOneConfig — the row appears on
 * first save rather than being pre-created with the campaign.
 *
 * Changing the size only affects panels created from here on. A panel is shaped
 * once, when `ensurePanel` first builds it, and is never revisited: growing
 * 3 → 4 adds no floating seat to panels that already exist, and shrinking 4 → 3
 * deletes no seat somebody may already be sitting in. Silently reshaping every
 * scheduled applicant's panel from a settings page would be a much bigger
 * action than the control implies.
 */
export async function savePanelSize(
  campaignId: string,
  size: PanelSize,
): Promise<PanelSize> {
  const saved = await prisma.interviewConfig.upsert({
    where: { campaignId },
    create: { campaignId, panelSize: size },
    update: { panelSize: size },
    select: { panelSize: true },
  });
  return isPanelSize(saved.panelSize) ? saved.panelSize : DEFAULT_PANEL_SIZE;
}

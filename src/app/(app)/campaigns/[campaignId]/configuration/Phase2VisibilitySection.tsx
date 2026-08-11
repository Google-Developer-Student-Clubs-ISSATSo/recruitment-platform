import { Icon } from "@/components/app-shell/icon";
import { getSession } from "@/lib/session";
import { getAdministratorId } from "@/lib/panel-authority";
import { getPhase2VisibilityDetail } from "@/lib/phase2-visibility-store";
import { Phase2VisibilityForm } from "./phase2-visibility/Phase2VisibilityForm";

// Server data-loader for the two Phase 2 read-visibility switches.
//
// Rendered behind the MANAGE_ACCOUNTS <PermissionGate> in page.tsx (matching
// CampaignLeadsSection), but narrowed once more HERE to the actual
// Administrator: the switches decide who may read other committees' notes, so
// holding a grantable permission is not enough — the title itself is the
// requirement, checked live. Someone with MANAGE_ACCOUNTS who is not the
// Administrator simply doesn't get the section, the same "absent rather than
// refused" treatment the MKT Skills Breakdown gives non-MKT-Leads.
//
// The action re-checks both, so this is presentation, not the enforcement.
export async function Phase2VisibilitySection({
  campaignId,
}: {
  campaignId: string;
}) {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return null;

  const administratorId = await getAdministratorId();
  if (administratorId !== userId) return null;

  const detail = await getPhase2VisibilityDetail(campaignId);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="visibility" className="text-[22px]" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Phase 2 Visibility
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Who can read the notes and flags recorded on Phase 2. Two
            independent switches; only you can change them.
          </p>
        </div>
      </div>

      <Phase2VisibilityForm
        campaignId={campaignId}
        rows={[
          {
            surface: "notes",
            label: "Notes",
            icon: "description",
            description: detail.notesClosed
              ? "Only you and each applicant's own committee lead can read notes."
              : "Every member can read notes on the Phase 2 page.",
            closed: detail.notesClosed,
            closedAtISO: detail.notesClosedAtISO,
            closedByName: detail.notesClosedByName,
          },
          {
            surface: "flags",
            label: "Red & Green Flags",
            icon: "warning",
            description: detail.flagsClosed
              ? "Only you and each applicant's own committee lead can read flags."
              : "Every member can read red and green flags on the Phase 2 page.",
            closed: detail.flagsClosed,
            closedAtISO: detail.flagsClosedAtISO,
            closedByName: detail.flagsClosedByName,
          },
        ]}
      />
    </section>
  );
}

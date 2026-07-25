import { getCapacityUsage } from "@/lib/committee-capacity-store";
import { CapacityBar } from "../final-decision/CapacityBar";
import { WidgetPanel } from "./WidgetPanel";

// Per-committee seat usage on the dashboard. Deliberately thin: the bars are
// the *same* <CapacityBar> the Final Decision meeting runs on, fed by the same
// getCapacityUsage — so a coordinator glancing here and the meeting screen can
// never show different numbers, and the "over capacity" styling means the same
// thing in both places.
//
// Rendered only for ENTER_FINAL_DECISION or MANAGE_CAPACITY holders (the
// <PermissionGate> in page.tsx); it loads its own data so nobody else pays for
// the query.
export async function CapacityWidget({ campaignId }: { campaignId: string }) {
  const usage = await getCapacityUsage(campaignId);

  return (
    <WidgetPanel
      icon="groups"
      title="Committee Capacity"
      subtitle="Accepted against target, counted live."
    >
      {/* <CapacityBar> itself is deliberately untouched by this design pass: it
          is shared with the Final Decision meeting screen, and restyling it here
          would either change that screen too or fork the two. The panel around
          it is what got the pass. */}
      <CapacityBar usage={usage} />
    </WidgetPanel>
  );
}

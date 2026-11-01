import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { CAMPAIGN_PAGE_PERMISSIONS } from "@/lib/route-permissions";
import { getDecisionRows } from "@/lib/final-decision-store";
import { renderInterviewReviewsPdf } from "@/lib/final-decision-pdf";
import { slugify } from "@/lib/interview-dossier";

// The interview-reviews PDF for the decision meeting: every applicant the Final
// Decision page lists, one page each, best interview first, with the panel's
// ratings and remarks and the Phase 2 notes and flags.
//
// Gated by the same permission as the page itself. A route handler can't use
// requirePermission — that redirects, which a download link can't follow
// meaningfully — so it answers 401 / 403 instead, using the same hasPermission
// check underneath. Everything is read fresh per request and never cached: the
// file holds applicant data, and a stale copy after someone changes a decision
// or a note would be worse than none.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;

  const userId = (await getSession())?.user?.id;
  if (!userId) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  if (
    !(await hasPermission(userId, CAMPAIGN_PAGE_PERMISSIONS["final-decision"]))
  ) {
    return Response.json({ error: "Not allowed." }, { status: 403 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { name: true },
  });
  if (!campaign) {
    return Response.json({ error: "Campaign not found." }, { status: 404 });
  }

  const pdf = await renderInterviewReviewsPdf({
    campaignName: campaign.name,
    generatedAt: new Date(),
    rows: await getDecisionRows(campaignId),
  });

  const filename = `interview-reviews-${slugify(campaign.name) || "campaign"}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

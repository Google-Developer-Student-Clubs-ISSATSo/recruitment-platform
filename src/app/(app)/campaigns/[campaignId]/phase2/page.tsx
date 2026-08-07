import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { getPhase2Data } from "@/lib/phase2-store";
import { tallyMktSkills } from "@/lib/phase2";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";
import { ApplicantCard } from "./ApplicantCard";
import { MktSkillsTable } from "./MktSkillsTable";

// Phase 2 — the working view for everyone who passed Phase 1.
//
// Open to every authenticated member, with no permission gate at all, which is
// why it has no entry in CAMPAIGN_PAGE_PERMISSIONS: the same treatment
// Statistics has. The only check is that someone is signed in, already enforced
// by the proxy and the (app) layout; the getSession() call below is
// defense-in-depth, matching how the other pages resolve their session.
//
// Read-only as far as Phase 1 is concerned: the answers are shown for context
// and there is no scoring control anywhere on this page. The only writes are
// appended Notes / Red Flags / Green Flags.
export default async function Phase2Page({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  // Only used to label an entry the moment its author adds it, before the
  // server's own row comes back — never as the stored authorship, which is
  // always the session's user id resolved server-side in the action.
  const authorName = session.user.name ?? session.user.email ?? "You";

  const { applicants, maxScore, skillSources, mktSkillWhitelist, mktPreferredCount } =
    await getPhase2Data(campaignId);
  // Live tally, every load — the same rule the interview-note AVGs and the
  // capacity counts follow. Nothing here is cached or written back, which is
  // what makes a whitelist edit show up on the very next load.
  const skills = tallyMktSkills(skillSources, mktSkillWhitelist);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          Phase 2
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Everyone who passed Phase 1, ranked by their screening score. Notes and
          flags recorded here are permanent and carry into the final decision.
        </p>
      </header>

      {applicants.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          Nobody has passed Phase 1 yet. Once applicants are accepted on the
          Phase 1 Selection page, they appear here.
        </p>
      ) : (
        <StaggerGroup className="space-y-4">
          {applicants.map((applicant) => (
            <StaggerItem key={applicant.id}>
              <ApplicantCard
                campaignId={campaignId}
                applicant={applicant}
                maxScore={maxScore}
                authorName={authorName}
              />
            </StaggerItem>
          ))}
        </StaggerGroup>
      )}

      <MktSkillsTable skills={skills} mktPreferredCount={mktPreferredCount} />
    </div>
  );
}

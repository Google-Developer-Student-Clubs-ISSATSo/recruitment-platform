import { prisma } from "@/lib/prisma";
import { Icon } from "@/components/app-shell/icon";
import type { FinalEmailLinks } from "@/lib/final-email-links";
import { FinalEmailLinksForm } from "./email-links/FinalEmailLinksForm";

// Server data-loader for the four external links the final-result emails point
// at. Rendered only for SEND_EMAILS holders (the <PermissionGate> in page.tsx);
// the save action re-checks that permission itself.
export async function FinalEmailLinksSection({
  campaignId,
}: {
  campaignId: string;
}) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      acceptanceFormLink: true,
      gdgcProgramLink: true,
      gdgcPlatformLink: true,
      discordInviteLink: true,
    },
  });

  const links: FinalEmailLinks = campaign ?? {
    acceptanceFormLink: null,
    gdgcProgramLink: null,
    gdgcPlatformLink: null,
    discordInviteLink: null,
  };

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="link" className="text-[22px]" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Final Decision Email Links
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Where the acceptance and rejection emails send applicants. Set these
            before sending final results.
          </p>
        </div>
      </div>

      <FinalEmailLinksForm campaignId={campaignId} initialLinks={links} />
    </section>
  );
}

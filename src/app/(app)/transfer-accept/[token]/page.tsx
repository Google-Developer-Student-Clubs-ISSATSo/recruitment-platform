import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Icon } from "@/components/app-shell/icon";
import { Committee, InviteStatus } from "@/generated/prisma/enums";

import { isInviteExpired } from "@/app/admin/transfer-admin/invite-link";
import { AcceptPanel } from "./accept-panel";

/**
 * Landing page for the accept link in the admin-transfer invite email.
 *
 * It lives under (app) rather than /admin on purpose: the recipient does not
 * hold MANAGE_ACCOUNTS yet — that is precisely what they are being offered — so
 * the /admin layout guard would redirect them away from their own invite. The
 * proxy still requires them to be signed in, which is exactly the bar we want.
 *
 * Everything here is a read-only pre-flight so the member sees a clear reason
 * rather than a dead button; acceptTransferInvite re-validates all of it before
 * writing anything.
 */
export default async function TransferAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getSession();
  const userId = session?.user?.id;

  const invite = await prisma.adminTransferInvite.findUnique({
    where: { token },
    select: {
      invitedEmail: true,
      status: true,
      createdAt: true,
      initiator: { select: { name: true } },
    },
  });

  const viewer = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, committee: true },
      })
    : null;

  const initiatorName = invite?.initiator?.name ?? "The current Administrator";

  // The moment an accept succeeds the client refreshes this route, so the very
  // next render sees an ACCEPTED invite. Treating that as "already used" would
  // replace the confirmation with an error for the person who just completed
  // the transfer — so their own accepted invite is a success state, not a
  // problem. Anyone else still gets the generic already-used message.
  const acceptedByViewer =
    invite?.status === InviteStatus.ACCEPTED &&
    viewer?.email.toLowerCase() === invite.invitedEmail.toLowerCase();

  const problem: string | null = acceptedByViewer
    ? null
    : !invite
    ? "This transfer link is not valid."
    : invite.status !== InviteStatus.PENDING
      ? "This transfer invite has already been used or cancelled."
      : isInviteExpired(invite.createdAt)
        ? "This transfer invite has expired. Ask the Administrator to send a new one."
        : !viewer ||
            viewer.email.toLowerCase() !== invite.invitedEmail.toLowerCase()
          ? "This invite was sent to a different member. Sign in with the invited email address to accept it."
          : viewer.committee !== Committee.TM
            ? "Only a TM committee member can hold the Administrator role."
            : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start gap-6">
          <div className="rounded-xl bg-primary/10 p-4">
            <Icon name="key" className="text-[40px] text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="mb-2 text-2xl font-semibold text-foreground">
              Administrator role transfer
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {acceptedByViewer
                ? "This transfer is complete."
                : problem
                  ? "This invitation can’t be accepted."
                  : `${initiatorName} has invited you to take over the TM Lead role.`}
            </p>
          </div>
        </div>

        <div className="mt-8">
          {acceptedByViewer ? (
            <div className="rounded-xl border border-status-accepted/30 bg-status-accepted/5 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-status-accepted">
                <Icon name="check_circle" className="text-[22px]" />
                You are the Administrator
              </h2>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                The TM Lead role has been transferred to your account and{" "}
                {initiatorName} has been downgraded to TM Reviewer. Admin
                Settings is available in your sidebar.
              </p>
            </div>
          ) : problem ? (
            <p className="flex items-start gap-2 rounded-lg border border-status-rejected/30 bg-status-rejected/5 p-4 text-sm text-status-rejected">
              <Icon name="error" className="text-[18px]" />
              {problem}
            </p>
          ) : (
            <>
              <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-950/40">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                  <Icon name="info" className="text-[18px] text-primary" />
                  What happens when you accept
                </h2>
                <ul className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400">
                  {[
                    "You receive the TM Lead role and every admin permission.",
                    `${initiatorName} is downgraded to TM Reviewer immediately.`,
                    "There is only ever one Administrator, so any other pending invites are cancelled.",
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <span className="text-primary">•</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <AcceptPanel token={token} initiatorName={initiatorName} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

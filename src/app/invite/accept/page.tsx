import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { acceptInvite, type AcceptResult } from "./accept-invite";

const ERROR_COPY: Record<
  Exclude<AcceptResult, { ok: true }>["reason"],
  { title: string; message: string }
> = {
  NOT_FOUND: {
    title: "Invite not found",
    message:
      "This invitation link is invalid. Please ask an admin to send you a new one.",
  },
  ACCEPTED: {
    title: "Invite already accepted",
    message:
      "This invitation has already been used. You can sign in with your email below.",
  },
  CANCELLED: {
    title: "Invite cancelled",
    message:
      "This invitation was cancelled by an admin. Please contact them for a new one.",
  },
  EXPIRED: {
    title: "Invite expired",
    message:
      "This invitation has expired. Please ask an admin to send you a new one.",
  },
  ERROR: {
    title: "Something went wrong",
    message:
      "We couldn't complete your invitation. If you're already a member, just sign in below.",
  },
};

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = await acceptInvite(token ?? "");

  if (result.ok) {
    redirect("/login?accepted=1");
  }

  const { title, message } = ERROR_COPY[result.reason];

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col items-center">
            <Logo className="h-14 w-14 rounded-xl" alt="GDGC Recruitment Platform" />
            <h1 className="mt-4 text-lg font-semibold text-foreground">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
              {message}
            </p>
          </div>
          <Link
            href="/login"
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

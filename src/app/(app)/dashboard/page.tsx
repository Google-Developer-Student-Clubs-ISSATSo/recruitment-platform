import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Landing page for regular (non-admin) members after login. Placeholder for now
// — a welcome line with the member's name and committee. Real dashboard content
// arrives in a later stage.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, committee: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {denied === "1" && (
        <div className="rounded-lg border border-status-rejected/30 bg-status-rejected/10 px-4 py-3 text-sm font-medium text-status-rejected">
          You don&apos;t have access to that page.
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome, {user?.name ?? "Member"} — {user?.committee} committee
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          This is your dashboard. More is coming soon.
        </p>
      </div>
    </div>
  );
}

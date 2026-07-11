import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-3xl font-semibold text-primary">403</p>
        <h1 className="mt-2 text-lg font-semibold text-foreground">
          Access denied
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          You don&apos;t have permission to view this page. If you believe this
          is a mistake, contact a TM Lead.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Building blocks for the per-route loading.tsx files. Each route composes
// these into the rough shape of its real page, so the layout doesn't jump when
// the content streams in. Kept deliberately coarse: a skeleton only has to
// match the page's regions, not every control inside them.

const CARD =
  "rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900";

// Widths cycled through for text lines, so a block reads as text rather than
// as a stack of identical bars.
const LINE_WIDTHS = ["w-full", "w-11/12", "w-4/5", "w-2/3", "w-5/6", "w-3/4"];

/**
 * The outer wrapper. Announced once to screen readers as a loading region —
 * the blocks inside are aria-hidden.
 */
export function PageSkeleton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn("space-y-6", className)}
    >
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

/** Page title and subtitle, with an optional action button on the right. */
export function HeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      {action && <Skeleton className="h-9 w-28 rounded-lg" />}
    </div>
  );
}

/** A bordered card with a title line, then `children` or `lines` of text. */
export function CardSkeleton({
  lines = 3,
  className,
  children,
}: {
  lines?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(CARD, "space-y-3 p-5", className)}>
      <Skeleton className="h-4 w-1/3" />
      {children ??
        Array.from({ length: lines }, (_, i) => (
          <Skeleton
            key={i}
            className={cn("h-3", LINE_WIDTHS[i % LINE_WIDTHS.length])}
          />
        ))}
    </div>
  );
}

/** A row of stat cards: a small label over a large figure. */
export function StatCardsSkeleton({
  count = 3,
  className = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn(CARD, "space-y-3 p-5")}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

/** A table: a header strip, then `rows` rows with an avatar and a few cells. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className={cn(CARD, "overflow-hidden")}>
      <div className="h-11 border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/40" />
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-neutral-200 px-5 py-4 last:border-0 dark:border-neutral-800"
        >
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Stacked one-line cards — a ranked list of applicants, say. */
export function RowListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cn(CARD, "flex items-center gap-3 px-4 py-3 sm:px-6")}
        >
          <Skeleton className="h-4 w-6 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-44 max-w-full" />
            <Skeleton className="h-3 w-32 max-w-full" />
          </div>
          <Skeleton className="h-6 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

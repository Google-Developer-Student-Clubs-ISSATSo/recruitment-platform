import { Icon, type IconName } from "@/components/app-shell/icon";

// The shared shell for the dashboard's PANEL widgets — the funnel, the
// interviews card, committee capacity. All three were repeating the same
// rounded-xl surface, the same bordered header row and the same icon chip, which
// is exactly the kind of thing that drifts one widget at a time.
//
// Deliberately NOT what <StatCard> uses. The two are different objects:
//   - a panel is a titled region containing a visualisation, and never moves;
//   - a tile is a single figure, and carries a tone accent instead of a header.
// Keeping them separate is the point — a dashboard where the funnel and the
// "Total Applicants" number look like the same component reads as flat.
//
// Presentational and hook-free, so the async server widgets can use it directly.
export function WidgetPanel({
  icon,
  title,
  subtitle,
  footer,
  className = "",
  children,
}: {
  icon: IconName;
  title: string;
  /** One line under the title saying how to read the widget. */
  subtitle?: string;
  /** Optional bordered action row at the bottom (e.g. a "Go to …" link). */
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex h-full flex-col rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
    >
      <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-4 sm:px-6 dark:border-neutral-800">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name={icon} className="text-[20px]" />
        </span>
        {/* min-w-0 so a long title truncates rather than widening the panel past
            the viewport at 375px. */}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground sm:text-lg">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-6">{children}</div>

      {footer && (
        <div className="border-t border-neutral-200 px-4 py-4 sm:px-6 dark:border-neutral-800">
          {footer}
        </div>
      )}
    </section>
  );
}

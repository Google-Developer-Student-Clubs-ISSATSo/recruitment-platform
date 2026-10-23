import { Skeleton } from "@/components/ui/skeleton";
import {
  CardSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/page-skeletons";

// Desktop-first like the page itself: committee tabs over a sidebar + table.
export default function Loading() {
  return (
    <PageSkeleton className="mx-auto max-w-[1440px]">
      <HeaderSkeleton action />
      <div className="flex gap-2 border-b border-neutral-200 pb-2 dark:border-neutral-800">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-28" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <CardSkeleton lines={8} />
        <CardSkeleton lines={12} />
      </div>
    </PageSkeleton>
  );
}

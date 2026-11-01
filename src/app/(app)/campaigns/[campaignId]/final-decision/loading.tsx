import { Skeleton } from "@/components/ui/skeleton";
import {
  CardSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/page-skeletons";

// Desktop-first like the page itself: the header, the three capacity cards, the
// view tabs, then the 320px applicant list beside the decision panel.
export default function Loading() {
  return (
    <PageSkeleton className="mx-auto max-w-[1440px]">
      <HeaderSkeleton action />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <CardSkeleton key={i} lines={2} />
        ))}
      </div>
      <div className="flex gap-2 border-b border-neutral-200 pb-2 dark:border-neutral-800">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-36" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <CardSkeleton lines={8} />
        <CardSkeleton lines={12} />
      </div>
    </PageSkeleton>
  );
}

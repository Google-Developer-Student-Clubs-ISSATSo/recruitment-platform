import { Skeleton } from "@/components/ui/skeleton";
import {
  CardSkeleton,
  HeaderSkeleton,
  PageSkeleton,
  StatCardsSkeleton,
} from "@/components/page-skeletons";

// Metric cards, two committee charts, then the breakdown row.
export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <StatCardsSkeleton count={3} className="grid gap-6 md:grid-cols-3" />
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <CardSkeleton key={i}>
            <Skeleton className="h-56 w-full" />
          </CardSkeleton>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <CardSkeleton key={i} lines={5} />
        ))}
      </div>
    </PageSkeleton>
  );
}

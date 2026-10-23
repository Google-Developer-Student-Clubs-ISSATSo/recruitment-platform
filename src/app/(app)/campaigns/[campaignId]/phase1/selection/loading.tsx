import {
  CardSkeleton,
  PageSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/page-skeletons";

// Header card with the threshold controls, outcome counts, then the ranking.
export default function Loading() {
  return (
    <PageSkeleton>
      <CardSkeleton lines={2} className="p-6" />
      <StatCardsSkeleton
        count={4}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      />
      <TableSkeleton rows={8} />
    </PageSkeleton>
  );
}

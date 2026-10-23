import {
  HeaderSkeleton,
  PageSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/page-skeletons";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action />
      <StatCardsSkeleton
        count={4}
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      />
      <TableSkeleton rows={8} />
    </PageSkeleton>
  );
}

import {
  HeaderSkeleton,
  PageSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/page-skeletons";

// Committee counts over the member permission table.
export default function Loading() {
  return (
    <PageSkeleton className="mx-auto max-w-6xl">
      <HeaderSkeleton action />
      <StatCardsSkeleton
        count={3}
        className="grid grid-cols-2 gap-4 lg:grid-cols-3"
      />
      <TableSkeleton rows={8} />
    </PageSkeleton>
  );
}

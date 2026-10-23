import {
  HeaderSkeleton,
  PageSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/page-skeletons";

export default function Loading() {
  return (
    <PageSkeleton className="mx-auto max-w-[1440px]">
      <HeaderSkeleton action />
      <StatCardsSkeleton count={3} className="grid grid-cols-1 gap-6 md:grid-cols-3" />
      <TableSkeleton rows={10} />
    </PageSkeleton>
  );
}

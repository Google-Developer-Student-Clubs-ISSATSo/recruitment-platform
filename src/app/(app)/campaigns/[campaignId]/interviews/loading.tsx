import {
  CardSkeleton,
  HeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/page-skeletons";

// Summary strip, the slot-entry table, then the panel board's day columns.
export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action />
      <CardSkeleton lines={1} />
      <TableSkeleton rows={5} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <CardSkeleton key={i} lines={4} />
        ))}
      </div>
    </PageSkeleton>
  );
}

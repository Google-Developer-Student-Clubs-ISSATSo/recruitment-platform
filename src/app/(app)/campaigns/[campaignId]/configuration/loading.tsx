import {
  CardSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/page-skeletons";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      {Array.from({ length: 4 }, (_, i) => (
        <CardSkeleton key={i} lines={4} />
      ))}
    </PageSkeleton>
  );
}

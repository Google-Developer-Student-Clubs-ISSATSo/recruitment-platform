import {
  CardSkeleton,
  HeaderSkeleton,
  PageSkeleton,
  StatCardsSkeleton,
} from "@/components/page-skeletons";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <StatCardsSkeleton count={3} />
      <div className="flex flex-col gap-6 lg:flex-row">
        <CardSkeleton lines={6} className="lg:min-w-0 lg:grow-[2] lg:basis-0" />
        <CardSkeleton lines={4} className="lg:min-w-0 lg:grow lg:basis-0" />
      </div>
      <CardSkeleton lines={3} />
    </PageSkeleton>
  );
}

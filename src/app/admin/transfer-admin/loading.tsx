import {
  CardSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/page-skeletons";

// The transfer form: one card holding the candidate picker and confirmation.
export default function Loading() {
  return (
    <PageSkeleton className="mx-auto max-w-3xl">
      <HeaderSkeleton />
      <CardSkeleton lines={5} />
    </PageSkeleton>
  );
}

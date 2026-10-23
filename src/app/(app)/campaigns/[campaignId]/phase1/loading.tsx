import {
  CardSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/page-skeletons";

// The scoring workstation: applicant queue on the left, answers on the right.
//
// This boundary also wraps phase1/selection, which has its own loading.tsx —
// the nearer one wins there.
export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <CardSkeleton lines={8} className="hidden lg:block" />
        <CardSkeleton lines={12} />
      </div>
    </PageSkeleton>
  );
}

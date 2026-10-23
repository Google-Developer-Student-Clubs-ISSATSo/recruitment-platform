import {
  CardSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/page-skeletons";

// The campaign list's grid of cards. This boundary sits ABOVE the
// [campaignId] layout, so it is also what shows while that layout runs its
// access check on the way into a campaign — the page's own loading.tsx takes
// over once the layout is through.
export default function Loading() {
  return (
    <PageSkeleton className="mx-auto max-w-6xl">
      <HeaderSkeleton action />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} lines={3} />
        ))}
      </div>
    </PageSkeleton>
  );
}

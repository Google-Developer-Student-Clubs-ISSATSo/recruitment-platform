import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton, PageSkeleton } from "@/components/page-skeletons";

// Back link, the applicant header card, then the note editor.
export default function Loading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-4 w-36" />
      <CardSkeleton lines={2} />
      <CardSkeleton lines={10} />
    </PageSkeleton>
  );
}

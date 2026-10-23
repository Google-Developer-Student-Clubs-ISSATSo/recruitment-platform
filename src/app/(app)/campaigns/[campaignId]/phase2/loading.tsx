import {
  HeaderSkeleton,
  PageSkeleton,
  RowListSkeleton,
} from "@/components/page-skeletons";

// The ranked list of collapsed applicant cards.
export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action />
      <RowListSkeleton rows={8} />
    </PageSkeleton>
  );
}

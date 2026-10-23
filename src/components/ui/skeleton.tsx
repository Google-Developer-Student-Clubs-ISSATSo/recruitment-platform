import { cn } from "@/lib/utils"

// A placeholder block for content that is still loading. The pulse is
// motion-safe only — with reduced motion it stays a static grey shape.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "rounded-md bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-800",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }

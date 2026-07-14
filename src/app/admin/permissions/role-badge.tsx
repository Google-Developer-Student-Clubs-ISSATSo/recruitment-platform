import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Renders a user's role label derived from their OWN assigned template:
 *   - permissions match the template exactly → the template name alone
 *   - any deviation                          → "{Template} Custom"
 * Never a generic, template-less "Custom".
 */
export function RoleBadge({
  templateLabel,
  isCustom,
  className,
}: {
  templateLabel: string;
  isCustom: boolean;
  className?: string;
}) {
  if (isCustom) {
    return (
      <Badge variant="secondary" className={cn("font-bold", className)}>
        {templateLabel} Custom
      </Badge>
    );
  }
  return (
    <Badge
      className={cn(
        "border-transparent bg-primary/10 font-bold text-primary",
        className,
      )}
    >
      {templateLabel}
    </Badge>
  );
}

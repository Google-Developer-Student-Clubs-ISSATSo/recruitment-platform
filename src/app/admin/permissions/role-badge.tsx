import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { IDENTITY_TINT_CLASS, type IdentityColor } from "@/lib/identity-color";

/**
 * Renders a user's role label derived from their OWN assigned template:
 *   - permissions match the template exactly → the template name alone
 *   - any deviation                          → "{Template} Custom"
 * Never a generic, template-less "Custom".
 *
 * Coloured by `identityColor` — the same value the avatar and committee badge
 * use — so one person reads as one colour across the whole row. The "Custom"
 * variant stays deliberately neutral: it is saying something about permission
 * DRIFT, not about who the person is, and colouring it by committee would let
 * it blend in with the badges that do carry identity.
 */
export function RoleBadge({
  templateLabel,
  isCustom,
  identityColor,
  className,
}: {
  templateLabel: string;
  isCustom: boolean;
  identityColor: IdentityColor;
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
        "border-transparent font-bold",
        IDENTITY_TINT_CLASS[identityColor],
        className,
      )}
    >
      {templateLabel}
    </Badge>
  );
}

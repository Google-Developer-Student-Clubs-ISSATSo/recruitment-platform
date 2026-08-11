import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { IDENTITY_TINT_CLASS, type IdentityColor } from "@/lib/identity-color";

/**
 * Renders a user's primary role label (see lib/primary-role.ts — a held Lead
 * title, else their OWN assigned template):
 *   - permissions match the template exactly → the label alone
 *   - any deviation                          → "{label} Custom"
 * Never a generic, label-less "Custom". `isCustom` is already false whenever
 * `label` came from a Lead title (see resolvePrimaryRole) — a Lead title
 * cannot drift, so it never gets the suffix regardless of permission changes.
 *
 * Coloured by `identityColor` — the same value the avatar and committee badge
 * use — so one person reads as one colour across the whole row. The "Custom"
 * variant stays deliberately neutral: it is saying something about permission
 * DRIFT, not about who the person is, and colouring it by committee would let
 * it blend in with the badges that do carry identity.
 */
export function RoleBadge({
  label,
  isCustom,
  identityColor,
  className,
}: {
  label: string;
  isCustom: boolean;
  identityColor: IdentityColor;
  className?: string;
}) {
  if (isCustom) {
    return (
      <Badge variant="secondary" className={cn("font-bold", className)}>
        {label} Custom
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
      {label}
    </Badge>
  );
}

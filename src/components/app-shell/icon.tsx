// Presentational Material Symbols icon. No hooks → usable from both server and
// client components. The font + base rule are loaded once by <AppShell>.
export function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span aria-hidden className={`material-symbols-outlined ${className}`}>
      {name}
    </span>
  );
}

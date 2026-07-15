"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const BUTTON_CLASS =
  "flex size-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-primary dark:text-neutral-400 dark:hover:bg-neutral-800";

// Returns false during SSR and the first client render, then true once mounted —
// without a setState-in-effect (which this repo's lint rules reject). Same
// guarantee as the useState/useEffect mounted flag.
const subscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

// Light/dark toggle for the top bar. next-themes' ThemeProvider (attribute
// "class") is configured in the root layout; this is the visible control.
//
// The server cannot know the resolved theme (next-themes reads it client-side
// from localStorage/system preference), so EVERY theme-derived output — the
// icon AND the aria-label — must be withheld until mount. Before mount we render
// a neutral, theme-independent placeholder that is byte-identical on the server
// and the first client pass, which is what keeps hydration clean.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    return (
      <button type="button" aria-label="Toggle theme" className={BUTTON_CLASS}>
        {/* Same-sized neutral placeholder — no theme-dependent content. */}
        <span className="size-5" aria-hidden />
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={BUTTON_CLASS}
    >
      {isDark ? (
        <Sun className="size-5" aria-hidden />
      ) : (
        <Moon className="size-5" aria-hidden />
      )}
    </button>
  );
}

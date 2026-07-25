"use client";

import { useSyncExternalStore } from "react";
import type { Transition, Variants } from "motion/react";

/**
 * Single source of truth for motion, the same way globals.css is the single
 * source of truth for colour. Nothing in the app should hand-write a duration
 * or an easing curve — import from here so a tweak lands everywhere at once.
 *
 * The ceiling is deliberate: 0.3s is the SLOWEST animation allowed anywhere.
 * These are interface transitions on a working tool, not decoration — a
 * coordinator paging through applicants hits them dozens of times an hour, and
 * anything slower starts reading as lag rather than polish.
 */

/** Seconds, for motion's `duration`. */
export const DURATION = {
  /** 0.15s — micro-feedback: hovers, badge swaps, colour changes. */
  fast: 0.15,
  /** 0.2s — the default. Entrances, exits, most state changes. */
  base: 0.2,
  /** 0.3s — the ceiling. Reserved for larger travel, e.g. the mobile drawer. */
  slow: 0.3,
} as const;

/** Milliseconds, for CSS `transition-duration` / `animation-duration`. */
export const DURATION_MS = {
  fast: DURATION.fast * 1000,
  base: DURATION.base * 1000,
  slow: DURATION.slow * 1000,
} as const;

/**
 * Entrances decelerate (ease-out) and exits accelerate (ease-in) — the standard
 * asymmetry: something arriving should settle, something leaving should get out
 * of the way. Cubic-bezier tuples rather than the named CSS keywords, so the
 * exact same curve is available to motion and to a CSS `transition-timing-function`.
 */
export const EASE = {
  /** Standard decelerate — for anything entering or expanding. */
  out: [0, 0, 0.2, 1],
  /** Standard accelerate — for anything leaving or collapsing. */
  in: [0.4, 0, 1, 1],
  /** Symmetric — for a move that neither enters nor exits (e.g. a slider). */
  inOut: [0.4, 0, 0.2, 1],
} as const;

/** CSS-ready equivalents, for `style={{ transitionTimingFunction: … }}`. */
export const EASE_CSS = {
  out: `cubic-bezier(${EASE.out.join(",")})`,
  in: `cubic-bezier(${EASE.in.join(",")})`,
  inOut: `cubic-bezier(${EASE.inOut.join(",")})`,
} as const;

/**
 * Stagger step between siblings in a list or grid. Small on purpose: with ~7
 * widgets a 0.05s step finishes the whole sequence in under 0.35s, so the last
 * item is not visibly waiting on the first.
 */
export const STAGGER = 0.04;

export const TRANSITION = {
  /** Entrance at the default duration. */
  enter: { duration: DURATION.base, ease: EASE.out } satisfies Transition,
  /** Micro-feedback. */
  quick: { duration: DURATION.fast, ease: EASE.out } satisfies Transition,
  /** Exit at the default duration. */
  exit: { duration: DURATION.base, ease: EASE.in } satisfies Transition,
} as const;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether the OS asks for reduced motion, read straight from
 * `window.matchMedia('(prefers-reduced-motion: reduce)')`.
 *
 * Returns false during SSR, which is the safe direction: the server renders the
 * animated markup, and the first client render corrects it before paint via the
 * hook below. Callers that animate MUST gate on this — it is not optional, and
 * "reduced" here means no movement at all rather than a shorter movement.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * Live `prefers-reduced-motion`, re-rendering if the user flips the OS setting
 * mid-session.
 *
 * Built on useSyncExternalStore rather than useState+useEffect for the same
 * reason <ThemeToggle> is: this repo's lint rules reject setState-in-effect, and
 * useSyncExternalStore gives the SSR-safe snapshot for free.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/**
 * A fade-and-rise entrance, or a no-op when reduced motion is asked for.
 *
 * Reduced motion collapses to the settled end state with a zero-length
 * transition, so the element is simply *there*. It is not left at opacity 0 —
 * an animation that never runs must never be the reason content is invisible.
 *
 * Both variants state EVERY property they control, including `y: 0` on the
 * reduced path. Omitting `y` there looks equivalent but is not: useReducedMotion
 * reports false in the SSR snapshot, so the first render applies the animated
 * `hidden` variant and writes `transform: translateY(8px)` inline. If the reduced
 * variants then never mention `y`, motion has no instruction to unset it and
 * every widget stays permanently shifted 8px down — a layout bug that only
 * appears for users who asked for *less* motion.
 */
export function fadeRise(reduced: boolean, distance = 8): Variants {
  return {
    hidden: reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: distance },
    visible: reduced
      ? { opacity: 1, y: 0, transition: { duration: 0 } }
      : { opacity: 1, y: 0, transition: TRANSITION.enter },
  };
}

/**
 * Parent variants that stagger children through {@link fadeRise}. `delayChildren`
 * stays 0 — the first item should appear immediately, so a repeat visit to an
 * already-warm page never reads as a delay before anything renders.
 */
export function staggerContainer(reduced: boolean, stagger = STAGGER): Variants {
  return {
    hidden: {},
    visible: {
      transition: reduced
        ? { duration: 0 }
        : { staggerChildren: stagger, delayChildren: 0 },
    },
  };
}

/** A plain fade, for content that swaps in place (a table body, a badge). */
export function fade(reduced: boolean): Variants {
  return {
    hidden: reduced ? { opacity: 1 } : { opacity: 0 },
    visible: reduced
      ? { opacity: 1, transition: { duration: 0 } }
      : { opacity: 1, transition: TRANSITION.quick },
  };
}

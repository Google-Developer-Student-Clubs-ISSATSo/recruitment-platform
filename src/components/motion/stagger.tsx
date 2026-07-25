"use client";

import { motion } from "motion/react";

import {
  fadeRise,
  staggerContainer,
  useReducedMotion,
} from "@/lib/motion-tokens";

/**
 * Entrance motion for a group of siblings, as a pair of wrappers rather than a
 * component that owns its children.
 *
 * The reason for the split: the widgets these wrap are async SERVER components
 * that load their own data and sit behind their own <PermissionGate>s. Passing
 * them through as `children` keeps all of that on the server — the client
 * boundary is only the animated <div>, so adding motion costs no data fetching
 * and no permission logic moving into the browser.
 *
 * Both halves gate on prefers-reduced-motion. When it is set the variants
 * collapse to a zero-length transition at full opacity, so the content is
 * simply present — never left mid-animation and never invisible.
 */
export function StaggerGroup({
  children,
  className,
  /** Seconds between siblings. Defaults to the shared STAGGER token. */
  stagger,
  /** Render as a <ul> when the group really is a list (campaign cards). */
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  as?: "div" | "ul";
}) {
  const reduced = useReducedMotion();
  const Component = as === "ul" ? motion.ul : motion.div;
  return (
    <Component
      className={className}
      variants={staggerContainer(reduced, stagger)}
      initial="hidden"
      animate="visible"
    >
      {children}
    </Component>
  );
}

/**
 * One staggered child. Inherits the run from the nearest <StaggerGroup> through
 * motion's own context, so it takes no props to coordinate with — which is what
 * lets a server component sit in between the two.
 */
export function StaggerItem({
  children,
  className,
  /** Travel distance in px for the rise. 0 for a pure fade. */
  distance,
  /** Must be "li" when the parent group is a <ul>. */
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  distance?: number;
  as?: "div" | "li";
}) {
  const reduced = useReducedMotion();
  const Component = as === "li" ? motion.li : motion.div;
  return (
    <Component className={className} variants={fadeRise(reduced, distance)}>
      {children}
    </Component>
  );
}

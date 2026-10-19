---
name: GDGC ISSATSO Recruitment Platform
description: Internal member-only recruitment tool for GDG on Campus ISSAT Sousse — operator-grade scoring, interviews, and final decisions.
colors:
  signal-blue: "#4285f4"
  signal-blue-ink: "#ffffff"
  pass-green: "#34a853"
  fault-red: "#ea4335"
  hold-yellow: "#fbbc05"
  ink: "#171717"
  canvas: "#ffffff"
  card-surface: "oklch(1 0 0)"
  muted-surface: "oklch(0.97 0 0)"
  divider: "oklch(0.922 0 0)"
typography:
  title:
    fontFamily: "Geist Sans, Arial, Helvetica, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Geist Sans, Arial, Helvetica, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Sans, Arial, Helvetica, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.1em"
    textTransform: "uppercase"
  score:
    fontFamily: "Geist Sans, Arial, Helvetica, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    fontFeature: "tabular-nums"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.signal-blue-ink}"
    height: "32px"
    rounded: "{rounded.lg}"
    padding: "0 10px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    height: "32px"
    rounded: "{rounded.lg}"
  button-destructive:
    backgroundColor: "{colors.fault-red} / 10%"
    textColor: "{colors.fault-red}"
    height: "32px"
    rounded: "{rounded.lg}"
  badge-status:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.signal-blue-ink}"
    height: "20px"
    rounded: "9999px"
    padding: "0 8px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    height: "32px"
    rounded: "{rounded.lg}"
    padding: "0 10px"
  card:
    backgroundColor: "{colors.card-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
  score-button-selected:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.signal-blue-ink}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
---

# Design System: GDGC ISSATSO Recruitment Platform

## Overview

**Creative North Star: "The Operator's Console"**

This is an instrument panel, not a billboard. The people using it score applicants one by one, dozens of times per hour, on laptops — so every surface is built for repeated contact: compact 32px controls, a strict color vocabulary that means exactly one thing per hue, and motion quick enough to read as feedback rather than theatricality (0.3s is a hard ceiling). Color is the console's language: signal blue speaks with the platform's voice, and green/red/yellow are status ink — a score is green, a rejection is red, a queue is yellow — never decoration. Identity colors for committees and leads are aliases of that same palette, so the app never carries a second source of color truth.

The neutrality is deliberate and OKLCH-based: flat tonal surfaces (white cards in light mode, `oklch(0.205 0 0)` in dark) with hairline dividers carry all structure, letting the four status inks stay loud because nothing around them competes. Density is high; padding is tight but never cramped; typography is a single Geist family with tabular numerals wherever a number can change under the user's eyes.

**Key Characteristics:**
- One palette, aliased everywhere — brand blue, three status inks, no second red, no decorative color
- Flat-by-default surfaces with hairline borders; elevation only as a response to intent
- Compact, consistent 32px control height across buttons, inputs, and selects
- Motion capped at 0.3s with instant reduced-motion fallbacks that never leave content hidden
- Dark-first friendliness: every surface token has a tuned `.dark` override, tuned for laptop-night scoring sessions

## Colors

A functional mono-brand: Google's product palette inherited as-is, treated as a vocabulary of state rather than ornament.

### Primary
- **Signal Blue** (#4285f4): The platform's voice and the only "brand" hue. Primary buttons, active score selection, active queue markers, focus rings, links. Blue means "the system acting / the current thing."

### Status Inks (meaning-bearing, never decorative)
- **Pass Green** (#34a853): Accepted, complete, saved. Light mode `#34a853`, dark `#4ade80`.
- **Fault Red** (#ea4335): Rejected, destructive, errors. Dark `#f87171`. Also aliased as `--destructive` — one red, not two.
- **Hold Yellow** (#fbbc05): Pending, to-discuss, not yet. Dark `#fde047`. Same ink aliases committee/lead identity colors — same ink, different meaning, never both at once.

### Neutral
- **Ink** (#171717): Primary text. Dark `#ededed`.
- **Canvas** (#ffffff): Page background. Dark `#0a0a0a`.
- **Card Surface** (oklch(1 0 0)): Cards and rails. Dark `oklch(0.205 0 0)`.
- **Muted Surface** (oklch(0.97 0 0)): Secondary fills, hover washes, table headers. Dark `oklch(0.269 0 0)`.
- **Divider** (oklch(0.922 0 0)): Hairline borders. Dark `oklch(1 0 0 / 10%)` — translucency instead of a lighter gray.

### Named Rules
**The One Ink Rule.** Each status hue says one thing app-wide: green = accepted/complete, red = rejected/destructive, yellow = pending, blue = primary action. A color never picks up a second meaning within a status role.
**The No Second Palette Rule.** Never restate a hex. New tokens alias the canonical ones (`--destructive: var(--status-rejected)`), and no component hardcodes a hex — every color resolves through `globals.css`.
**The Dark-Night Rule.** Every color token ships a `.dark` override tuned by hand; nothing is left to browser default blending.

## Typography

**Body Font:** Geist Sans (via `next/font`, fallback Arial/Helvetica)
**Mono Font:** Geist Mono (numbers in logs/technical contexts)

**Character:** One family for everything — the hierarchy is carried entirely by size, weight, and case, never by a second typeface. Utility-grade clarity.

### Hierarchy
- **Title** (600, 24px/1.3): Page headings ("Phase 1 Scoring Queue").
- **Section Label** (600, 12px, uppercase, 0.1em tracking): Pane and card headers ("Answers", "Scoring", "Note").
- **Body** (400, 14px/1.5): Question text, answers, table cells, control labels.
- **Meta** (400–500, 11px): Sub-labels, progress counts, lock labels.
- **Score** (700, 30px, tabular-nums): Live weighted total — the only display-size number in the app, reserved for the thing being decided.

### Named Rules
**The Tabular Numbers Rule.** Any number that updates in place (totals, counts, percentages) renders with `tabular-nums`, so digits never twitch as values change.

## Layout

Dense operational grids, not editorial layouts. The scoring surface is a two-pane workstation: a 260px fixed queue rail beside a fluid detail pane from `lg` (1024px) up; below that, panes swap full-screen via list/detail state instead of cramming both. Sidebar collapses to a drawer below 768px. Spacing rhythm: 10px inside controls, 12–16px inside cards, 24px between major sections. Dense tables choose deliberate collapse strategies per page rather than one global pattern.

## Elevation & Depth

**Flat by default, lifted on intent.** Surfaces are flat: a card is border + fill, nothing more. Elevation appears only as a response to state or as a structural accent — `shadow-sm` on persistent rails (queue list, note card), a 1px press (`translate-y-px`) on active buttons, and 3px focus rings as the system's "currently here" glow. There are no ambient shadows and no layered stacks; depth is communicated by tone (surface vs. canvas) and hairline dividers first, shadow second.

## Shapes

Rounded but disciplined. The base radius is 10px (`--radius: 0.625rem`) with a derived scale (6/8/10/14/18px) — small controls and score buttons round at 10px (`rounded-lg`), cards and panels at 14px (`rounded-xl`), badges are full pills (`rounded-4xl`). Borders are 1px hairlines everywhere; the one intentional exception is the dashed border reserved for empty states. No sharp-cornered elements except where a rail's active indicator meets its edge (`rounded-r` bar).

## Components

### Buttons
- **Shape:** 10px radius, always. Heights: 32px default, 28px small, 24px xs; icon-variant squares match.
- **Primary:** Signal Blue fill, white ink, hover to 80% opacity.
- **Outline:** hairline border on canvas, fill flip to muted-surface on hover; dark mode sits on `input/30`.
- **Secondary / Ghost:** muted fill and borderless wash respectively — navigation and low-stakes actions.
- **Destructive:** never solid red — a 10% red tint fill with red ink (20% in dark), bordering solid only via `aria-invalid`.
- **Press/active:** 1px translateY; focus: 3px ring at ring/50.
- **Motion:** all transitions 150ms ease-out unless the motion tokens say otherwise.

### Badges / Chips
20px pills, 8px horizontal padding, 12px text at 500 weight. Status badges tint rather than shout: destructive is red/10; identity badges carry committee/lead ink.

### Cards / Containers
14px radius, card-surface fill, 1px hairline border, 12–16px internal padding. Header strips (muted-surface, 12px uppercase label) mark rail-like containers (the queue). Empty states: dashed hairline border, centered icon + two lines of copy.

### Inputs / Fields
32px tall, transparent fill over input border, 10px horizontal padding, 14px text. Focus: border shifts to ring color + 3px soft ring. Invalid: destructive border + red-tinted ring (stronger in dark). Textarea variant allows resize-y; character-capped fields block overflow client-side before it ever hits the server.

### Score Button (signature)
The console's core control: one button per allowed value in a question's `noteScale` — never a hardcoded scale. Unselected: hairline border, transparent fill. Selected: primary fill + white ink. On pick, a 200ms scale beat (1 → 1.12 → 1) acts as the save receipt, since there is no Save button — a pick writes immediately. Disabled while a save transition is pending.

### Navigation
Left sidebar (canvas-tinted `oklch(0.985 0 0)`, drawer below 768px), active items marked by tone + the media rail's sliding indicator pattern (`layoutId` shared-element bars) — "where am I" always animates as movement, never blinks.

## Do's and Don'ts

### Do:
- **Do** reference tokens (`bg-primary`, `text-status-rejected`, `border-border`) — never hardcode a hex, including in vendored component adaptations.
- **Do** import all motion from `motion-tokens.ts` (0.15/0.2/0.3s) and collapse every animation to its settled state under `prefers-reduced-motion`.
- **Do** use the `Icon` wrapper (lucide-react) exclusively; icons speak through `currentColor` and scale with font-size.
- **Do** reserve status ink for its one meaning and pull destructive confirmations through the shared `ConfirmDialog`.
- **Do** keep controls at the compact scale (32px control height, 14px body) — density is the product of a repeated-use tool.

### Don't:
- **Don't** introduce marketing-site gloss — no gradients, no glassy blur, no oversized type, no motion slower than 0.3s. This is an internal operator console, not a landing page.
- **Don't** restyle a primitive into a one-off; extend the cva variants or the shared component instead, so patterns stay learnable.
- **Don't** let a color acquire a second meaning within status roles (yellow is never "success," red is never "brand").
- **Don't** invent a second icon system or an unlabeled icon-only control without an accessible name.
- **Don't** cache or persist computed values (averages, running totals) in the UI when they are live-derived on read — the score display is recomputed, never stored.

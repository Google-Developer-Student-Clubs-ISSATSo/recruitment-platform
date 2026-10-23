<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# GDGC Recruitment Platform --- Agent Context

---

## What this is

An internal, member-only recruitment platform for Google Developer Group
on Campus ISSAT Sousse (GDGC-ISSATSO), replacing spreadsheets and manual
email/scheduling tools for their annual core team recruitment. Full
functional spec lives in `docs/PRODUCT_SPECIFICATION.md` --- read that
for the complete process design (Phase 1 scoring rubric, cross-committee
interview panels, final decision meeting, etc.) before making structural
changes.

Related docs, all in `docs/`:

- `PRODUCT_SPECIFICATION.md` --- the full functional spec
- `HANDOFF_RUNBOOK.md` --- ownership/credentials/yearly handoff process
- `AGENT_CONTEXT.md` --- long-form version of this file, incl. full build history

---

## Tech Stack

- Tailwind CSS v4, CSS-first config: no `tailwind.config.ts` --- tokens
  live in `globals.css` via `@theme`
- Auth.js v5 (`next-auth@beta`), magic-link only, no passwords, no public
  sign-up --- database session strategy (not JWT), specifically for
  server-side revocability
- Email: Gmail SMTP via Nodemailer (Resend was tried and dropped --- don't
  reintroduce it). Currently sending from a personal Gmail for
  dev/testing, will move to the club's Gmail (with its own App Password)
  before real use.
- `motion` (formerly Framer Motion) for animation --- installed as a
  plain npm package, NOT via their paid AI Kit/MCP

---

## Core Architecture Concepts

### Permission system (not fixed roles)

Every capability is a `PermissionKey` enum value, granted per-user via
`UserPermission` rows --- NOT computed from a role. `RoleTemplate` /
`RoleTemplatePermission` are just starting-point presets applied at
account creation; a user's real capabilities are always their own
`UserPermission` rows, independently editable. `User.roleTemplateId`
tracks which template they STARTED from, purely so the UI can show
"{Template} Custom" when their permissions have drifted from that
template's defaults --- it is not re-derived by inference.

`hasPermission(userId, permission)` / `requirePermission(permission)` in
`src/lib/permissions.ts` are the ONLY way permission checks should
happen --- never reimplement this logic inline. `requirePermission`
redirects with an access-denied message for page-level guards;
`PermissionGate` (a component) is for section-level "render or don't,"
used within a page that has other content visible to broader audiences
(e.g. Configuration page's per-permission sections).

There's exactly ONE Administrator (`TM_LEAD` role template) at a time,
enforced as a hard rule outside the permission system --- the role
transfers via an invite-and-accept flow (`AdminTransferInvite`), never by
directly editing another account's permissions. The outgoing TM Lead is
auto-demoted to `TM_REVIEWER` on transfer completion.

`VIEW_STATISTICS` and `VIEW_COMMITTEE_DASHBOARD` were deliberately
deleted: Statistics is open to every member, interview-note visibility
is the close/reopen workflow (panelist-only + TM Lead), and the
final-decision dashboard is gated by `enter_final_decision` (plus TM
Lead). Don't reintroduce either; remove any stale reference on sight.

### Campaign scoping

Every recruitment cycle is a `Campaign`. Nearly everything
(`Applicant`, `PhaseOneQuestion`, `PhaseOneConfig`, `CommitteeCapacity`,
etc.) is scoped by `campaignId`. A real bug occurred early on where a
query/import check wasn't properly scoped and leaked data across
campaigns --- when adding new campaign-scoped models or queries, always
double-check the `where` clause includes `campaignId`, don't assume it's
implied.

### Live-computed, not stored

Several values are deliberately NEVER stored, always computed on read,
to avoid drift: `InterviewNote` AVG (average of the 7 rating fields),
`CommitteeCapacity`'s running accepted count, all Statistics page
metrics. If you're tempted to cache one of these, don't --- the whole
point is they can never be wrong relative to the real underlying data.

### Activity log

`ActivityLogEntry` records every meaningful mutation across the app
(`logActivity()` helper). Only real, existing users are logged --- failed
login attempts from unknown emails are deliberately NOT logged (a
conscious decision, not an oversight). Bulk actions (e.g. bulk permission
grants) log ONCE per action with an affected-count/list in `details`, not
once per affected row.

### Icons

`lucide-react` ONLY, everywhere. A real bug occurred when a 21st.dev
reference component used Google's Material Symbols ligature-icon-font
approach (literal text like `"arrow_back"` rendered via a font that
never got imported) --- if adapting any external component reference,
always swap its icons for the lucide-react equivalent, never copy an
icon-font approach as-is.

### Componentization

Page files (`page.tsx`) stay thin composition/data-fetching layers.
Reusable pieces (`ConfirmDialog`, `PermissionGate`, table row components,
etc.) live in `src/components/`. Confirmation dialogs are mandatory for
destructive/high-consequence actions (deletes, permission revocation,
finalizing a stage) --- reuse the existing `ConfirmDialog` component,
don't build one-off dialogs.

### Design tokens

Colors are CSS custom properties in `globals.css` (`--color-primary`,
`--color-status-accepted/rejected/pending`, `--background`/
`--foreground`), each with `.dark` overrides. NEVER hardcode a hex value
in a component --- always reference these tokens (`bg-primary`,
`text-status-rejected`, etc.). Status colors map to real meaning:
green = accepted, red = rejected, yellow = pending/to-discuss, blue =
primary/branding --- this mapping is intentional and consistent
everywhere.

Animation tokens live in `src/lib/motion-tokens.ts` (fast/base/slow,
max 0.3s anywhere in the app --- this is an internal tool used
repeatedly, not a marketing site, motion should be quick and
purposeful). Every animation must respect `prefers-reduced-motion`.

Every page now has a responsive treatment (mobile ~375px, tablet ~768px,
desktop) --- dense tables use a deliberately-chosen collapse strategy
(check individual page reports for which one), the sidebar collapses to
a drawer below ~768px. Final Decision is the one accepted exception:
desktop-first, since it's used live/screen-shared during the decision
meeting --- mobile isn't fully optimized there by deliberate tradeoff.

---

## Data Model Notes

- `Applicant.rawFormData` is the full original CSV row; scored-question
  answers are looked up via each `PhaseOneQuestion.sourceField`.
- `InterviewNote` is a single shared note per applicant, NOT per
  panelist.

---

## Known Pending Decisions

- Next.js 16.2.11 upgrade --- deferred until pre-launch (Stage 7)
- Login enumeration message --- deliberately kept as the friendly
  "not registered" text, not a generic message (reviewed tradeoff, not
  a bug)
- Session `maxAge` --- 3 days (confirmed intentional after a config
  drift briefly set it to 24h)
- Nonce-based CSP, blanket zod adoption --- both deferred, current
  validation approach is manual-but-solid, not worth the regression
  risk of a rewrite
- Calendly/bit.ly live sync --- explicitly NOT built; manual slot-time
  entry was chosen deliberately over webhook/polling integration
- Real infrastructure deployment (Vercel, production Supabase/Postgres,
  Tech Lead's dedicated email) --- not yet done, tracked in
  `HANDOFF_RUNBOOK.md`
- Code cleanup pass (unused files/deps, dead code, comments, console
  statements, duplicated-logic consolidation) --- not yet done; a full
  prompt for it exists

---

## If You're Picking This Up Fresh

1. Read `docs/PRODUCT_SPECIFICATION.md` first for the _why_ behind the
   process design.
2. Check `scripts/audit-rbac.ts` --- run it after any permission-related
   change, it's a real regression gate, not just a one-off script.
3. When in doubt about a color, icon, or animation choice: reuse an
   existing token/pattern rather than introducing a new one.

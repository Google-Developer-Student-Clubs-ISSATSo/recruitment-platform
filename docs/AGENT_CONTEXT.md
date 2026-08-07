# GDGC Recruitment Platform --- Agent Context

This document exists so any new Claude Code session (or Claude chat) can
pick up this project with full context, without needing the entire build
history re-explained. If you're an agent reading this: this is the
authoritative summary of what exists, how it's built, and why certain
decisions were made the way they were.

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
- `GOOGLE_FORM_SYNC_SETUP.md` --- setup/rotation for the live Form-to-app
  applicant sync (Script Properties, webhook secret, campaign binding)

---

## Tech Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 (CSS-first
  config, no `tailwind.config.ts` --- tokens live in `globals.css` via
  `@theme`)
- PostgreSQL via Prisma 7, hosted on **Neon** (not Supabase --- Supabase
  was rejected specifically because its free tier pauses a project after
  a period of inactivity and requires a manual resume; Neon's free tier
  instead scales compute to zero on idle, with no project-level pause and
  no data ever becoming inaccessible). Prisma 7 requires driver-adapter
  based client construction (`@prisma/adapter-pg`) and moved connection
  URLs out of `schema.prisma` into `prisma.config.ts` --- the datasource
  block in `schema.prisma` carries no `url`/`directUrl` any more.
- Deployed on **Vercel**, via a fork of the org repo held in a dedicated
  Tech Lead GitHub account (the org itself doesn't permit direct Vercel
  deploys) --- see `HANDOFF_RUNBOOK.md` for the full deployment/handoff
  model, including the fork-sync discipline required to keep it from
  drifting from the canonical org repo.
- Auth.js v5 (`next-auth@beta`), magic-link only, no passwords, no public
  sign-up --- database session strategy (not JWT), specifically for
  server-side revocability
- Email: Gmail SMTP via Nodemailer (NOT Resend --- Resend was tried,
  removed, unused dependency).
- shadcn/ui + lucide-react for components/icons
- `motion` (formerly Framer Motion) for animation --- installed as a
  plain npm package, NOT via their paid AI Kit/MCP
- Next.js 16 renamed `middleware.ts` to `proxy.ts` --- the file is
  `src/proxy.ts`. This matters for any new route that needs to sit
  outside normal auth-gated navigation (see the webhook endpoint below):
  the proxy's matcher must explicitly exclude such routes, or it silently
  redirects unauthenticated requests to `/login`.

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
auto-demoted to `TM_REVIEWER` on transfer completion. **The TM Lead IS
the TM committee's lead** --- there is no separate `CampaignLead` role
for TM (see below); "TM Lead" and "Administrator" are the same person by
design.

There is no `VIEW_STATISTICS` or `VIEW_COMMITTEE_DASHBOARD` permission ---
the Statistics page is open to any authenticated member with no
permission check, and the final-decision dashboard is gated purely by
`enter_final_decision`. Committee Reps have no standing dashboard or
notes-preview access; interview-note visibility for anyone who isn't the
TM Lead runs entirely through actual panel membership plus the
close/reopen workflow (panelist-only while open). The admin Permission
Management UI shows a short plain-language definition under every
permission.

`UserPermission` rows carry a `source` field (`MANUAL` or `LEAD_ROLE`) ---
see Campaign Leads below. A manual re-toggle of a permission by the
Administrator always overrides the marker back to `MANUAL`, protecting it
from later automatic revocation.

### Campaign Leads

Four appointable per-campaign lead roles, tracked via the `CampaignLead`
model (`campaignId`, `role`, `userId`, unique per campaign+role): **MKT
Lead, EER Lead, Club Lead, Technical Lead**. There is no separate
Technical *Committee* --- Technical Lead is a standalone role, not tied
to a `User.committee`. Assigned by the Administrator only, and scoped
**per campaign** --- an appointment does not carry over automatically to
the next campaign.

- Assigning MKT Lead or EER Lead only offers users whose `User.committee`
  matches (enforced server-side, not just hidden in the UI). Club Lead
  and Technical Lead are unrestricted --- any user, any committee.
- Assigning Technical Lead auto-grants `ENTER_TECHNICAL_SCORE`
  (`source: LEAD_ROLE`) if the user doesn't already hold it manually.
  Reassigning Technical Lead auto-revokes that permission from the
  previous holder, but ONLY if it was never independently, manually
  granted (`source: MANUAL` grants are never touched by this mechanism).
- MKT Lead, EER Lead, and Club Lead currently carry no auto-granted
  permissions of their own --- their authority comes from being checked
  directly by name in specific places (interview seat assignment, the
  Configuration picker restriction above), not from the permission
  system.
- The in-app **Technical Lead** role and the **infrastructure Tech Lead**
  (Vercel/Neon owner, per `HANDOFF_RUNBOOK.md`) happen to be the same
  person today but are deliberately uncoupled concepts in the code --- the
  infra role lives entirely outside this app.

### Live-resolved authority, not snapshotted

A pattern established with Campaign Leads and reused for interview panel
approvals: anything that checks "who currently has authority to do X"
re-derives the answer fresh at the moment of the check (`hasPermission`,
`getCampaignLeadHolders`, `findFirst({ role: TM_LEAD })` for the
Administrator), never trusts a value stored earlier. `PanelSeatApprovalRequest.approverUserId`
is a deliberate exception used only for display/audit purposes (a record
of who was *expected* to approve at request time) --- the actual
approve/decline authorization check always re-resolves the current
committee Lead or Administrator fresh, so a mid-flight role reassignment
can't leave a stale ex-Lead with lingering approval power, or lock out
the legitimate new one.

### Interview panels --- lead-assigned, not self-serve

Self-serve panel-seat claiming has been **removed entirely** and replaced
with lead-controlled assignment (a real, deliberate reversal of the
original Stage 4 design, not a bug fix). Current model:

- `PanelSeat.kind` is a dedicated `PanelSeatKind` enum (`MKT | TM | EER |
  FLOATING`) --- deliberately **separate** from the `Committee` enum used
  by `Applicant.preferredCommittee`/`assignedCommittee`/
  `CommitteeCapacity`, so a panel-seat concept can never destabilize
  applicant-sorting logic elsewhere.
- Panel size is configurable per campaign (`InterviewConfig.panelSize`,
  3 or 4) --- 3 is the fixed MKT/TM/EER mapping; 4 adds one `FLOATING`
  seat tied to no committee. Panel size is fixed at the panel's creation
  time (`ensurePanel`), not retroactively applied to already-created
  panels if the config changes later --- a panel missing a seat has no
  automatic repair path today (a deliberate tradeoff, not an oversight;
  not currently reachable through any existing flow).
- The Interviews page itself is open to any authenticated member,
  read-only for anyone who isn't an authorized assigner for a given seat.
  `CLAIM_PANEL_SEAT` no longer means "may access this page" --- it means
  "eligible to be seated" (checked as part of the assignment candidate
  pool), enforced entirely through `src/lib/panel-authority.ts`.
- MKT Lead / EER Lead can assign/reassign only their own committee's
  seat. The Administrator owns the TM seat (since TM Lead = Administrator,
  no separate CampaignLead row exists for TM). Any of MKT Lead / EER Lead
  / Club Lead can assign the FLOATING seat, no approval needed, ever.
- **Club Lead exception:** the Club Lead may take any of the three fixed
  committee seats **except** the one matching the interviewed applicant's
  own `preferredCommittee` (blocked outright, no approval possible for
  that specific case). Taking a different committee's seat requires
  that seat's Lead (or the Administrator, for TM) to approve, via an
  **in-app** popup (no email/token) --- modeled on `AdminTransferInvite`'s
  request/actively-accept shape, but session-based rather than
  email-based.
- Clearing a scheduled interview time now warns before discarding an
  already-staffed panel (it previously did so silently), and any
  `PENDING` `PanelSeatApprovalRequest` on that panel is auto-declined as
  part of a confirmed clear --- logged under its own distinct action type
  so the Activity Log never misattributes an automatic system decline to
  a real human decision by the approver.

### Google Form --- live applicant sync

Applicants can enter the platform two ways: the original CSV import, or
a live webhook fired by a Google Apps Script bound to the Form
(`docs/google-apps-script/on-form-submit.gs`, lives in Google's
environment, never deployed as part of this repo). Both paths share one
underlying validation/auto-reject function (`src/lib/applicant-intake.ts`)
--- there is no separate, parallel validation logic for the webhook.

- Endpoint: `POST /api/webhooks/applicant-submission`. Authenticated by
  a shared secret (`X-Webhook-Secret` header, compared via
  `crypto.timingSafeEqual`, never a naive `===`) against
  `APPLICANT_WEBHOOK_SECRET` --- **not** an Auth.js session, since the
  caller is Google's servers, not a signed-in user. `src/proxy.ts`'s
  matcher explicitly excludes `/api/webhooks/*` for this reason.
- The request body must include an explicit `campaignId` --- there is
  deliberately no "auto-resolve the currently open campaign" logic, since
  this app allows multiple campaigns open simultaneously and guessing
  which one a submission belongs to would be unsafe.
- Submissions to a closed campaign (`Campaign.isOpen === false`) are
  rejected with a 400 --- once a campaign's Form sync is meant to be
  "switched off," closing the campaign is what does it.
- Duplicate submissions (same `campaignId` + email, e.g. a retried Apps
  Script trigger) are handled idempotently --- a repeat call returns 200
  "already exists," never an error, and never creates a second row.
- Every webhook-created applicant is logged via `logActivity()`, tagged
  distinctly (`google_form_webhook` as source) from a manual CSV import,
  with the Administrator recorded as actor (a webhook call has no signed-
  in user; if no Administrator exists at all, applicant creation still
  succeeds, logging is skipped, and a `console.error` records why).

### Campaign scoping

Every recruitment cycle is a `Campaign`. Nearly everything
(`Applicant`, `PhaseOneQuestion`, `PhaseOneConfig`, `CommitteeCapacity`,
`CampaignLead`, `InterviewConfig`, `Phase2Entry`, etc.) is scoped by
`campaignId`. A real bug occurred early on where a query/import check
wasn't properly scoped and leaked data across campaigns --- when adding
new campaign-scoped models or queries, always double-check the `where`
clause includes `campaignId`, don't assume it's implied.

`ActivityLogEntry.campaignId` is nullable, with **no FK relation** ---
deliberately matching the existing `targetId` pattern, so entries survive
even if their campaign is later deleted. Seven action types (auth events,
account/permission management, admin transfer) are genuinely global and
never carry a `campaignId`, regardless of which page they were triggered
from --- a permission grant is about a user's standing capability, not
about whichever campaign page happened to be open at the time. Deleting a
campaign cascades its scoped log entries, but the `CAMPAIGN_DELETED`
entry itself is written as global (`campaignId: null`) *after* the
cascade, specifically so the one record proving the campaign was deleted
can't delete itself. **Known limitation:** every log entry created
before the campaign-scoping migration permanently displays as "global,"
even if it was originally campaign-scoped in spirit --- there was no way
to retroactively backfill which campaign old rows belonged to, and no
backfill was ever attempted.

### Live-computed, not stored

Several values are deliberately NEVER stored, always computed on read,
to avoid drift: `InterviewNote` AVG (average of the 7 rating fields),
`CommitteeCapacity`'s running accepted count, all Statistics page
metrics, the Phase 2 page's MKT-skills tally. **The one deliberate
exception:** Phase 1's ranked score, both on the Selection page and the
Phase 2 page, reads the cached `PhaseOneResult.weightedTotal` rather than
recomputing live from `PhaseOneScore` --- this is intentional, matching
the principle that a decision, once made, should reflect what was
actually reviewed at the time, not silently drift if a question's
coefficient is edited afterward. `Phase2Entry`'s `scoredCount`-equivalent
completeness check (whether an applicant's Phase 1 answers are fully
scored) stays live, since scoring can genuinely continue after a
campaign's nominal "close."

### Activity log

`ActivityLogEntry` records every meaningful mutation across the app
(`logActivity()` helper). Only real, existing users are logged --- failed
login attempts from unknown emails are deliberately NOT logged (a
conscious decision, not an oversight). Bulk actions (e.g. bulk permission
grants) log ONCE per action with an affected-count/list in `details`, not
once per affected row. See "Campaign scoping" above for the
`campaignId`/global split. The Administrator can delete Activity Log
entries (per-campaign, or all of them) --- a manual, destructive,
typed-confirmation action, distinct from the automatic campaign-deletion
cascade above.

### Phase 2 page (post-Phase-1, pre-Interviews)

**Naming note:** this is a different thing from the recruitment process's
own "Phase 2" stage-numbering language that may appear in
`PRODUCT_SPECIFICATION.md` for the Interview stage --- check that document
for how the two are currently distinguished before assuming they're the
same. This page (`campaigns/[campaignId]/phase2/`) lists applicants who
passed Phase 1, ranked by the cached `PhaseOneResult.weightedTotal`
(never live-recomputed, see above), showing only configured/coefficient-
bearing question answers (reusing the same filter as the Phase 1 Answers
panel). Any club member (no dedicated permission) can add an entry to a
per-applicant, append-only Notes / Red Flag / Green Flag log
(`Phase2Entry`) --- entries are never edited or deleted, only added to,
each recording its author.

**MKT Skills Breakdown**, on the same page: a live-computed per-skill
tally, counting only values that match a campaign-specific, admin-
editable whitelist (`MktSkillWhitelist`) --- pulled from the applicant's
**"Other skills"** form field only (not the free-text "Soft skills"
field, which the tally deliberately never reads). A value only counts if
it case-insensitively matches an entry in that campaign's whitelist;
anything else (e.g. "Public speaking," which is a soft skill, not an MKT
skill) is silently excluded, not shown as an "unrecognized" row. The
whitelist is managed from the Configuration page (same
`CONFIGURE_SCREENING` gate as the scoring-rubric section) --- add/remove
takes effect immediately on next page load, no per-applicant re-tagging
needed. A separate header count shows applicants who both prefer the MKT
committee **and** have at least one whitelist-matched skill (not simply
every MKT-preferring applicant --- an earlier version of this count had
that bug, since fixed).

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
`ui/pager.tsx`, etc.) live in `src/components/`. Confirmation dialogs are
mandatory for destructive/high-consequence actions (deletes, permission
revocation, finalizing a stage, clearing a staffed interview panel) ---
reuse the existing `ConfirmDialog` component, don't build one-off
dialogs. Pagination is consolidated onto the single `ui/pager.tsx`
component --- there is no longer a second, hand-rolled pagination
implementation anywhere in the app.

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

Every page has a responsive treatment (mobile ~375px, tablet ~768px,
desktop) --- dense tables use a deliberately-chosen collapse strategy,
the sidebar collapses to a drawer below ~768px. Final Decision is the one
accepted exception: desktop-first, since it's used live/screen-shared
during the decision meeting --- mobile isn't fully optimized there by
deliberate tradeoff.

---

## Data Model Summary

Auth: `User` (has `committee`), `Account`, `Session`, `VerificationToken`
(Auth.js standard tables)

Permissions: `RoleTemplate`, `RoleTemplatePermission`, `UserPermission`
(has `source: MANUAL | LEAD_ROLE`), `AdminTransferInvite`

Campaign Leads: `CampaignLead` (`campaignId`, `role: LeadRole`, `userId`,
unique per campaign+role)

Campaigns & Applicants: `Campaign`, `Applicant` (has `rawFormData` JSON
--- the full original CSV row or webhook payload, used to look up
scored-question answers via each question's `sourceField`)

Phase 1: `PhaseOneQuestion` (per-campaign, configurable coefficients +
`noteScale` array + `sourceField` mapping + `requiresTechnicalScorer`
flag), `PhaseOneScore`, `PhaseOneResult` (`weightedTotal` --- the cached,
authoritative score, see "Live-computed, not stored" above),
`PhaseOneConfig` (`rejectThreshold`, `targetCount`)

Phase 2: `Phase2Entry` (`applicantId`, `type: NOTE | RED_FLAG |
GREEN_FLAG`, `authorId`, `text`, append-only), `MktSkillWhitelist`
(`campaignId`, `skillName`)

Interviews: `InterviewSlot`, `InterviewConfig` (`campaignId`,
`panelSize: 3 | 4`), `InterviewPanel`, `PanelSeat` (`kind:
PanelSeatKind` --- MKT/TM/EER/FLOATING, deliberately not the `Committee`
enum, see above), `PanelSeatApprovalRequest` (Club Lead cross-committee
seat approvals), `InterviewNote` (single shared note per applicant, NOT
per panelist --- has `closedAt`/`closedById` for the close/reopen
visibility workflow)

Capacity & Emails: `CommitteeCapacity`, `EmailLog` (tracks every send,
prevents duplicate sends)

Logging: `ActivityLogEntry` (has nullable, no-FK `campaignId`)

---

## Feature Status (by build stage)

- **Stage 0-1**: Scaffolding, Docker Postgres, Tailwind v4 setup ---
  done
- **Stage 2**: Full schema, magic-link auth, permission system,
  Permission Management + Transfer Admin Role admin screens, Activity
  Log --- done
- **Stage 3**: Phase 1 --- schema, `configure_screening` UI, CSV import
  with auto-reject-on-non-ISSATSO, Scoring Queue (with the restricted
  Technical-Scorer-only view, which now also shows Soft skills and Other
  skills as read-only reference fields), Selection/ranking (simplified:
  below threshold = reject, top N = accept, everyone else = PENDING
  until a human manually resolves via Accept/Reject/Mark as To Discuss/
  Revert), Phase 1 batch emails --- done
- **Stage 4**: Interviews --- schema, booking/reminder emails, manual
  slot-time entry (Calendly/bit.ly stay external by deliberate choice,
  no live sync built for scheduling). **Self-serve panel-claiming has
  since been fully removed and replaced with lead-controlled
  assignment** --- see "Interview panels" above. Interview Notes with
  the close/reopen visibility workflow --- done.
- **Stage 5**: Final Decision --- `CommitteeCapacity` config, the live
  decision dashboard (lean AVG-only view + expandable full notes),
  Shortlist Pool pass, final acceptance/rejection emails --- done
- **Cross-cutting**: Dashboard, Statistics pages built with real
  live-computed metrics --- done
- **Security audit**: completed, most fixes applied and pushed (rate
  limiting, CSP headers, RBAC audit script at `scripts/audit-rbac.ts`
  --- re-runnable regression gate, currently well past its original
  count as new permission-adjacent features have added their own checks).
- **Design/motion/responsive pass: COMPLETE across all pages built as of
  that pass** --- Login, Dashboard, Campaigns, Applicants, Phase 1
  Screening, Phase 1 Selection, Interviews, Interview Notes, Final
  Decision, Statistics, Configuration, Admin Permissions, and Activity
  Log have all been through the 21st.dev component pass + `motion`
  animation + responsive treatment. Pages added afterward (Phase 2, the
  Campaign Leads config section, the MKT skills whitelist config
  section) --- confirm whether these have been through the same pass or
  still need it.
- **Code cleanup pass**: done --- audit found the codebase already clean,
  pagination consolidated onto `ui/pager.tsx`, two genuinely-unused
  motion-token exports removed.
- **Real infrastructure deployment**: DONE --- live on Vercel (deployed
  from a fork of the org repo under a dedicated Tech Lead GitHub account)
  + Neon Postgres. See `HANDOFF_RUNBOOK.md` for the full ownership model.
- **Google Form live sync**: done --- see above.
- **Campaign Leads, Phase 2 page, Interviews rework, Activity Log
  campaign scoping**: all done --- see the relevant sections above.

---

## Known Pending Decisions

- Next.js patch upgrades --- apply deliberately and reviewed, not
  reflexively; the Next.js 16 `middleware.ts` → `proxy.ts` rename was
  already a real, silent breaking change encountered once this project
  (see "Google Form" above).
- Login enumeration message --- deliberately kept as the friendly
  "not registered" text, not a generic message (reviewed tradeoff, not
  a bug)
- Session `maxAge` --- 3 days (confirmed intentional after a config
  drift briefly set it to 24h)
- Nonce-based CSP, blanket zod adoption --- both deferred, current
  validation approach is manual-but-solid, not worth the regression
  risk of a rewrite
- Calendly/bit.ly live sync for interview *scheduling* --- explicitly NOT
  built; manual slot-time entry was chosen deliberately over webhook/
  polling integration. (Not to be confused with the Google Form applicant
  sync above, which is a live webhook, for a deliberately different
  reason --- continuous applicant intake, not scheduling.)
- A missing `PanelSeat` on an existing panel has no automatic repair path
  --- accepted as a deliberate tradeoff, not currently reachable through
  any existing flow, but worth knowing if one ever surfaces.
- Pre-migration `ActivityLogEntry` rows permanently display as "global"
  --- accepted, no backfill was ever in scope.

---

## Immediate Next Step

No large feature work is currently queued. Recent fixes (committee-
restricted Lead/seat pickers, the MKT-skills header count correction,
and admin-editable `User.committee`) were the last completed batch. When
picking up new work, check with whoever's driving the product decisions
before assuming what's next --- this file describes what's built, not
what's planned.

## If You're Picking This Up Fresh

1. Read `docs/PRODUCT_SPECIFICATION.md` first for the _why_ behind the
   process design --- but note it may lag real behavior in places (e.g.
   the Interviews self-serve claiming section is stale relative to the
   lead-assignment rework above); this file (`AGENT_CONTEXT.md`) is the
   more current source for recent architectural changes.
2. Check `scripts/audit-rbac.ts` --- run it after any permission-related
   change, it's a real regression gate, not just a one-off script.
3. Check git log for the most recent commits to confirm exactly where
   things left off.
4. When in doubt about a color, icon, or animation choice: reuse an
   existing token/pattern rather than introducing a new one.
5. Before any schema change involving more than an additive nullable
   column, read the generated migration SQL yourself and consider a
   fresh backup first --- this database is live, in production, on Neon.

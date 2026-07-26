# GDGC Recruitment Platform --- Product Specification (v10)

## Overview

**GDGC Recruitment Platform** is a standalone web application that centralizes and secures the
recruitment workflow of Google Developer Group on Campus ISSAT Sousse (GDGC-ISSATSO), replacing
scattered forms, spreadsheets, manual sheet copying, and manual room-hunting with one platform
used only by club members.

Recruitment spans **three committees** applicants compete for:

- **MKT** --- Marketing
- **TM** --- Team Management
- **EER** --- Event Organisation

The **Technical Committee** is mandatory for every accepted member (everyone joins a technical
sub-committee regardless of MKT/TM/EER placement) --- it's not something applicants compete for,
so it has no form option, no panel seat, and no capacity tracking in GDGC Recruitment Platform.

Key differences from a generic model:

- **The TM Lead is the single administrator**, and the role changes hands through a deliberate
  invite-and-accept handoff each year, not manual permission editing --- see **Admin Handoff**
  below.
- **Infrastructure ownership is separate from in-app roles.** A dedicated Tech Lead identity
  (its own club email + GitHub account, set up at deployment time) holds real database/hosting
  access outside the platform --- but inside the platform, the Tech Lead is just a regular member
  like anyone else, with whatever in-app permissions the TM Lead chooses to grant. See
  **Infrastructure Ownership** below.
- **Applicant pool is unified, not siloed by committee.** Applicants state a preferred committee,
  but Phase 1 screening is done centrally by the TM team across the whole pool, and final
  committee placement can differ from the applicant's preference based on available capacity and
  fit --- decided during the final decision meeting, not locked in at application time.
- **Phase 1 is a weighted scoring rubric, not just discussion.** The TM Lead decides which form
  questions are scored and sets each one's coefficient; scores are entered per question on a
  small fixed scale (0 / 0.5 / 1 by default, expandable to include 0.25 / 0.75); the weighted
  total ranks every applicant automatically.
- **Interview panels are cross-committee.** Every applicant who reaches the interview stage is
  interviewed by one representative from each committee (MKT, TM, EER), not just the committee
  they applied to.
- **The public form stays on Google Forms**, one static form, no branching. GDGC Recruitment
  Platform imports responses via Sheets/CSV rather than hosting the public form itself.
- **Interview time selection stays on the existing bit.ly booking tool.** The TM Lead (or whoever
  they delegate) enters each applicant's chosen slot into GDGC Recruitment Platform afterward.
- **Room lookup links out to the existing class-availability project** (direct link, no API).
- **The final decision meeting is a live Discord call with one screen-share** --- only the person
  driving the call enters decisions into GDGC Recruitment Platform, but everyone with dashboard
  access can review notes on their own before or after.
- **Access control is permission-based, not fixed-role**, and the TM Lead is the only one who can
  hand out permissions --- everyone else's capabilities exist only because the TM Lead granted
  them.
- **A full activity log** lets the TM Lead see every action taken by every member --- imports,
  scores, note edits, panel claims, decisions, emails, permission changes --- all in one place.

---

# The Application Form

One static Google Form, same questions for every applicant --- no per-committee branching. Two
sections:

**Section 1 --- basics:** Email, full name, birthday, phone number, Facebook (required), GitHub
(optional), LinkedIn (optional), *are you an ISSATSO student?*, current diploma, year of study,
double major info, technical skills, other skills, soft skills.

**Section 2 --- the scored part:**

1. Hobbies and interests
2. Why join GDG / what do you intend to learn?
3. Team player/leader experience
4. What makes you stand out
5. Previous club/community experience
6. Most significant achievement
7. "Project falling apart" scenario
8. Describe yourself in 3 adjectives
9. Which committee suits you best (MKT/TM/EER) --- this is always the `preferred_committee`
   field, never a scored question
10. Life motto
11. Terms and Conditions
12. Any questions? (optional)

**Which of these are scored, and their coefficients, is entirely the TM Lead's call each cycle**
(via `configure_screening`) --- nothing is hardcoded or assumed. Last year, for reference, the TM
Lead scored questions 2, 3, 4, 5, 6, 7, 8, and 10, plus two additional columns (Big Yes/Big No,
Technical Skills) --- see **Phase 1 Scoring Configuration** below for that example. This year's
TM Lead may choose a different set entirely.

---

# Permissions

Each permission is a discrete, independently grantable capability. Roles (next section) are just
default bundles of these --- only the TM Lead can add or remove any permission for any user, at
any time.

| Permission | What it allows |
|---|---|
| `view_full_pool` | See every applicant across all committees during Phase 1 |
| `configure_screening` | Add/edit/remove scored questions, coefficients, note scales, the reject threshold, and the target accept count for Phase 1 |
| `screen_phase1` | Enter per-question scores (incl. Big Yes/Big No) for applicants during Phase 1, and resolve the "to discuss" band |
| `enter_technical_score` | Enter the Technical Skills score for an applicant --- granted individually (e.g. to the Technical lead's chosen scorer), independent of `screen_phase1` |
| `enter_interview_slot` | Enter an applicant's booked time (from bit.ly) into GDGC Recruitment Platform |
| `claim_panel_seat` | Claim an open interviewer seat on an applicant's panel |
| `edit_own_interview_notes` | Write/edit the shared interview note for applicants the user is on the panel for |
| `enter_final_decision` | Actually record Accept / Reject / Shortlist and any committee reassignment --- in practice held by whoever drives the live decision meeting |
| `manage_capacity` | Set/adjust per-committee capacity targets |
| `import_applicants` | Import Google Sheets/CSV applicant data |
| `manage_accounts` | Create/edit/deactivate user accounts and their permissions --- **TM Lead only, not delegable** |
| `manage_campaigns` | Open/close recruitment, create/archive campaigns |
| `send_emails` | Send batch or individual emails from an existing template |
| `view_campaign_history` | Access past campaigns |
| `view_activity_log` | See the full action history --- **TM Lead only** |

---

# Roles (default permission bundles)

Starting points assigned when an account is created --- only the TM Lead can customize any
individual user's permissions afterward.

## Interviewer (default)
`claim_panel_seat`, `edit_own_interview_notes`

## TM Reviewer (default)
`view_full_pool`, `screen_phase1`, `enter_interview_slot`, `claim_panel_seat`,
`edit_own_interview_notes`

*Not included by default:* `configure_screening` --- setting coefficients, note scales, and the
reject threshold/target count stays with the TM Lead unless specifically delegated.

## Technical Scorer (default)
`enter_technical_score` only --- a narrow, single-purpose grant for whoever the Technical lead
designates to score the Technical Skills column. *(Note: this is unrelated to the "Tech Lead"
infrastructure identity described below --- one is an in-app scoring permission, the other is
who holds the database password. The same person could hold both, but they're granted through
completely different mechanisms.)*

## Committee Representative (default)
`claim_panel_seat`, `edit_own_interview_notes`.

*No `enter_final_decision` by default* --- during the live meeting they contribute verbally, they
don't type anything in. They have no standing dashboard or notes-preview access outside their own
panel seats --- they see an interview note only for applicants they're actually claimed a panel
seat for, and only while that note is open (see the close/reopen workflow in Interview Notes
below).

## TM Lead (the sole Administrator)
Every permission listed above, across all committees, and the **exclusive** ability to grant or
revoke any permission for anyone else. There is exactly **one** of this role at any time --- a
hard limit, not a permission, since the whole point is centralized control over who can edit
what. The role changes hands only through the **Admin Handoff** flow below --- never by directly
editing another account's permissions.

## Applicant
No account, no permissions --- applicants never log into GDGC Recruitment Platform.

---

# Admin Handoff

The TM Lead role transfers once a year, before recruitment starts, through an invite-and-accept
flow rather than manual permission editing:

1. The outgoing TM Lead opens **Transfer Admin Role** and enters the incoming TM Lead's email.
2. The incoming TM Lead receives an email invite with an accept link. Until they accept, the
   outgoing TM Lead **remains** the Administrator --- nothing changes yet.
3. On acceptance:
   - The incoming person becomes the sole Administrator (TM Lead), with the full default
     permission set.
   - The outgoing TM Lead is automatically stepped down to a **TM Reviewer** --- they keep their
     screening and interview permissions, they just lose Administrator-level control.
4. The transfer is atomic --- there is never a moment with zero Administrators or two
   Administrators. If the invite is sent to the wrong email or needs to be redone, the outgoing
   TM Lead can cancel a pending invite and send a new one, as long as they haven't been replaced
   yet.

This keeps the handoff a deliberate, consent-based action by the incoming person (they have to
actively accept), rather than something the outgoing person can get half-right by toggling
checkboxes.

---

# Infrastructure Ownership (Tech Lead)

Separate from anything above: at deployment time, a dedicated email and GitHub account are
created specifically for the **Tech Lead** --- the one person responsible for maintaining the
codebase and infrastructure (hosting, database).

- The Tech Lead has real access to the database and hosting dashboards --- this access lives
  **outside** GDGC Recruitment Platform entirely (it's a Vercel/Supabase-level login, not
  anything the app's permission system governs).
- **Inside** the platform, the Tech Lead is a normal member. Holding infrastructure access grants
  **no automatic in-app permissions** --- if they need to see applicant data or score anything,
  the TM Lead grants that the same way they would for anyone else.
- This is intentionally a single person, not a shared team account --- same reasoning as the TM
  Lead cap: one clear owner of infrastructure-level credentials.
- The Tech Lead identity doesn't necessarily rotate on the same yearly cycle as the TM Lead ---
  it changes hands whenever the technical maintainer changes, following the same ownership
  principles laid out in the **Handoff Runbook**.

---

# Authentication

- **No public sign-up.** Applicants never log in.
- Only the TM Lead creates accounts for club members, using club email addresses, and assigns
  each account's starting permissions (defaulting to a role template, then adjustable).

---

# Recruitment Campaigns

Each campaign (e.g. Recruitment 2026) contains:

- Imported applicant data
- The Phase 1 question/coefficient/note-scale configuration used that year
- Phase 1 scores and selection results
- Interview schedule and panel assignments
- Interview notes
- Final decisions (including any committee reassignment)
- Email history
- Per-committee capacity targets and running counts
- Recruitment-wide statistics

Access to past campaigns is controlled by `view_campaign_history`.

---

# Step-by-Step Flow

### 1. Application (external)

Applicant fills the single static Google Form described above.

### 2. Close & Import

Anyone with `import_applicants` closes the form and imports responses via CSV/Sheets import.

**Automatic filter:** any applicant who answers "No" to *"Are you an ISSATSO student?"* is
auto-set to **Rejected (Phase 1)** immediately on import, with no scoring and no manual review.
(A reviewer can manually reinstate someone if this was a data-entry mistake.)

Everyone else lands with status **Submitted** and a `preferred_committee` field (from Question
9).

### 3. Phase 1 Scoring

Anyone with `screen_phase1` works through the queue one applicant at a time, entering a score for
each question the TM Lead configured that cycle, including the Big Yes/Big No field. Anyone with
`enter_technical_score` enters the Technical Skills score independently, since it's often a
different person and doesn't have to happen in the same pass.

A **Processed / Remaining** counter tracks progress across the whole pool (an applicant counts
as "Processed" once every required score, including Technical Skills, is filled in).

GDGC Recruitment Platform computes each applicant's weighted total automatically:

```
weighted_total = Σ (question_score × question_coefficient)
```

### 4. Phase 1 Selection

Once scoring is complete, GDGC Recruitment Platform shows the full pool **ranked by weighted
total**. The TM Lead (via `configure_screening`) sets, for this campaign:

- **Reject threshold** --- any applicant below this score is automatically marked **Rejected
  (Phase 1)** (red).
- **Target count** --- how many applicants to advance this year (e.g. 30, 35, 40 --- varies year
  to year).

GDGC Recruitment Platform then auto-classifies:

- Clearly above the target-count cutoff, above threshold → **auto-Shortlisted** (green).
- Below the reject threshold → **auto-Rejected** (red).
- The borderline band around the target-count line → **To Discuss** --- anyone with
  `screen_phase1` resolves these manually until exactly the target count is reached.

### 5. Phase 1 Emails + GDG Day Invite

Anyone with `send_emails` batch-sends Phase 1 rejection emails and Phase 1 acceptance/GDG-Day-
invite emails, using the existing templates (no new templates needed --- just the send
workflow). GDG Day itself happens offline; GDGC Recruitment Platform just tracks the status
(`Invited to GDG Day`).

### 6. Interview Time Selection (external, bit.ly)

Shortlisted applicants book their interview time through the existing bit.ly tool, exactly like
today. Once booking closes, anyone with `enter_interview_slot` enters each applicant's chosen
date/time into GDGC Recruitment Platform.

### 7. Interviewer Self-Selection (Panel Claiming)

A board shows applicants needing interviewers. Anyone with `claim_panel_seat` claims a seat on an
applicant's panel for their own committee:

- Exactly one interviewer per committee per applicant (MKT, TM, EER) --- three total.
- No duplicate interviewer on the same applicant.
- A committee's seat locks once claimed.

### 8. Room Assignment (external link)

GDGC Recruitment Platform links out to the existing class-availability project (direct link, no
API). The interviewer manually adds the chosen room as a note on the slot.

### 9. Interview Notes (single shared entry per applicant)

One shared note per applicant --- not one per interviewer --- filled in collaboratively by the
panel, matching how the interview actually happens. Anyone with `edit_own_interview_notes` for
that applicant can fill in or update it. Fields:

| Field | Notes |
|---|---|
| Name | pulled from applicant record |
| Form Score | Phase 1 weighted total, shown for reference |
| Year of Study | pulled from applicant record |
| Time | interview time (from step 6) |
| Jury | the panel members who conducted this interview |
| Personality (/10) | |
| Communication (/10) | |
| Motivation (/10) | |
| Creativity (/10) | |
| Problem Solving (/10) | |
| Stress Management (/10) | |
| Team Work (/10) | |
| AVG | auto-calculated average of the 7 category scores above |
| Interview remarks | free text |

Scores allow quarter-point increments (e.g. `8.75`). Visible only to that applicant's assigned
panel members while the note is open, and to the TM Lead at all times --- **this replaces the
shared-sheet-then-copy-into-a-private-sheet step entirely.** Once a panelist closes a note, it is
hidden from everyone except the TM Lead until reopened.

### 10. Final Decision Meeting

A live Discord call: everyone discusses each applicant out loud, but only the person driving the
call --- holding `enter_final_decision` --- shares their screen and enters decisions.

For each applicant, the dashboard keeps it lean --- just what's needed to decide in the moment,
not the full note breakdown:

- Name, year of study, preferred committee
- Phase 1 weighted total (Form Score)
- **Interview Score (AVG only)** --- not the full 7-category breakdown or remarks; those stay
  available on the interview note itself for anyone who wants to review beforehand
- Running capacity counter per committee (e.g. "MKT 4/4, TM 3/3, EER 5/5")

Decision entry: **Accept / Reject / Shortlist**, with the option to set `assigned_committee`
different from `preferred_committee` if capacity is full elsewhere and the discussion supports a
different fit. Once the main pool is reviewed, the dashboard surfaces the shortlist pool
(ranked/filterable) to fill any remaining capacity.

### 11. Final Emails

Anyone with `send_emails` batch-sends acceptance and rejection emails from the dashboard once
decisions are locked in --- using the existing templates.

---

# Phase 1 Scoring Configuration

The TM Lead (via `configure_screening`) can, each cycle:

- **Add, edit, or remove scored questions** --- there is no fixed list; the TM Lead decides what
  counts toward the score every year.
- **Set each question's coefficient.**
- **Set each question's note scale.** Every question starts with the base scale **{0, 0.5, 1}**;
  the TM Lead can add `0.25` and/or `0.75` to widen a specific question's scale, or remove
  values, independently per question.

For reference, last year's configuration:

| Question | Coefficient |
|---|---|
| Why join GDG / intend to learn | 19 |
| Team player/leader experience | 12 |
| What makes you stand out | 15 |
| Previous club/community experience | 5 |
| Most significant achievement | 8 |
| "Project falling apart" scenario | 12 |
| Describe yourself in 3 adjectives | 3 |
| Life motto | 3 |
| Big Yes / Big No | 8 |
| Technical Skills | 15 |
| **Total** | **100** |

---

# Statistics (beyond Phase 1)

A reporting view, available to any authenticated member --- no permission required:

- Total applicants this campaign
- Applicants per preferred committee (from Question 9)
- Applicants per final assigned committee (after any reassignment)
- Phase 1 outcome breakdown (auto-rejected / auto-shortlisted / resolved via "to discuss")
- Rejection reason breakdown (non-ISSATSO auto-reject vs. Phase 1 score vs. final-stage
  rejection)
- Final acceptance rate per committee

*(Open to adding more --- let me know if there's a specific metric you want tracked that isn't
listed here.)*

---

# Data Model Notes (for schema design)

- `Applicant`: base fields (incl. `is_issatso_student`) + `preferred_committee` +
  `assigned_committee` (nullable until final decision) + `status`.
- `PhaseOneQuestion`: per campaign --- `text`, `coefficient`, `note_scale` (array, default
  `[0, 0.5, 1]`), `order`, `is_active`. Editable via `configure_screening`.
- `PhaseOneScore`: one row per (applicant, question), holding the entered value and who scored
  it. Technical Skills scores are the same shape, just gated by `enter_technical_score` instead
  of `screen_phase1`.
- `PhaseOneResult`: per applicant --- `weighted_total` (computed), `rank`, `classification`
  (auto-accept / auto-reject / to-discuss), `final_phase1_status`.
- `PhaseOneConfig`: per campaign --- `reject_threshold`, `target_count`.
- `InterviewSlot`: one per applicant --- `scheduled_time` (manual entry from bit.ly) + `room`
  (manual note).
- `InterviewPanel`: one per applicant, holds up to 3 `PanelSeat` records (one per committee: MKT,
  TM, EER), each claimed by one user.
- `InterviewNote`: **one per applicant** (not per panelist) --- full field list above, `avg`
  computed.
- `CommitteeCapacity`: per campaign, per committee --- target seats + running accepted count.
- `AdminTransferInvite`: `invited_email`, `token`, `status` (pending/accepted/cancelled/expired),
  `initiated_by`, `created_at`. Drives the Admin Handoff flow above.
- `ActivityLogEntry`: `actor`, `action_type`, `target` (applicant, permission, campaign, etc.),
  `timestamp`, `details` --- written on every meaningful action (score entered, note edited, slot
  entered, panel seat claimed, decision recorded, email sent, permission changed, account
  created, admin transfer initiated/accepted).

---

# Security

- Every action checks a specific permission, not a role label.
- `manage_accounts` and `view_activity_log` are **TM Lead only** and not delegable --- everything
  else can be granted out at the TM Lead's discretion.
- The Admin Handoff flow is deliberately invite-and-accept, not direct editing --- it can never
  produce a state with zero or two Administrators, and it requires active consent from the
  incoming TM Lead rather than a one-sided action by the outgoing one.
- Infrastructure access (Tech Lead) and in-app permissions are governed completely separately ---
  holding the database password grants nothing inside the app automatically.
- `configure_screening` is powerful (it decides which questions count and sets the reject
  threshold/target count) --- default-held only by the TM Lead, delegable if they choose.
- `enter_technical_score` is deliberately separate from `screen_phase1` so the Technical lead can
  delegate scoring without granting Phase 1 visibility into every other question.
- `enter_final_decision` is deliberately narrow and the only committee-scoped permission ---
  holding it is the only way to record a decision; nothing else implies it.
- `view_full_pool` stays **manually managed** --- no auto-expiry after Phase 1 closes; the TM
  Lead revokes it directly if needed.
- Interview notes are visible only to that applicant's assigned panel members while the note is
  open, and to the TM Lead at all times --- never club-wide, and never to anyone outside the
  panel regardless of committee role.
- Applicant data is never public; the platform has no public surface at all.
- Rejected applicants' personal data is anonymized automatically a set period after the campaign
  closes (e.g. 12 months).

---

# Admin Panel --- TM Lead Controls

**Transfer Admin Role**
- Enter the incoming TM Lead's email to send an invite.
- View/cancel a pending invite.
- Transfer completes automatically on acceptance (see Admin Handoff).

**Permission Management**
- View a user's current permissions (grouped by category, with committee scope shown where
  relevant).
- Toggle individual permissions on/off.
- Reset a user back to a role template's defaults.

**Activity Log ("historique")**
- Full, chronological record of every meaningful action taken by every member: imports, Phase 1
  scores entered, interview notes edited, panel seats claimed, slot times entered, final
  decisions recorded, emails sent, every permission change, and admin transfers.
- Filterable by member, action type, and date.
- Visible only to the TM Lead (`view_activity_log`).

---

# Suggested Build Phasing

**Phase 1 --- Screening core**
Google Sheets/CSV import with auto-reject on non-ISSATSO, permission system (catalog +
user-permission table + role templates, single TM Lead admin, invite-based Admin Handoff),
`PhaseOneQuestion`/`PhaseOneScore` scoring rubric with configurable coefficients and note scales,
weighted ranking, reject-threshold/target-count selection logic with the "to discuss" band,
processed/remaining tracker, batch email sending, activity log foundation.

**Phase 2 --- Interviews**
Manual slot-time entry, interviewer panel claiming board (3 seats), link-out to the
room-availability project, single shared interview note per applicant with the full field list.

**Phase 3 --- Decision + polish**
Live final decision dashboard (lean per-applicant view: Form Score + Interview Score only),
statistics/reporting view, permission management UI + full activity log UI, applicant
status-lookup page, data retention/anonymization job.

---

# Suggested Tech Stack

- **Frontend:** Next.js + TypeScript + Tailwind CSS
- **Backend:** Next.js API routes
- **Database:** PostgreSQL via Prisma
- **Import:** Google Sheets API (read-only) or manual CSV export/import
- **Hosting:** Vercel + a free-tier managed Postgres (Supabase or Neon) --- low cost, fits the
  seasonal usage pattern
- **Auth:** Simple email/password or magic-link for internal roles only

---

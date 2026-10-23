---
date: 2026-10-23
scope: Phase 2 page (/campaigns/[campaignId]/phase2) and Interviews page (/campaigns/[campaignId]/interviews, excluding the per-applicant Notes sub-page)
modes: static (source read only — no running instance was driven)
---

# UX Audit — Phase 2 & Interviews

## Executive summary

Both pages are structurally sound: permissions shape what each viewer sees,
destructive slot-clearing and email sends go through `ConfirmDialog`, and
motion respects reduced-motion. The blocking concern is **colour contrast of
the status tokens used as text**. The amber `--status-pending` computes to
**1.7:1** on white, and it carries the board's key "Needs Interviewers" signal
and Phase 2's "No answer found" / "Partial score" captions. Behind that sit
three Major interaction risks: unsaved slot times are silently dropped when
paging; the member picker commits on the first `change`; and interviewer
removal and permanent Phase 2 entries are one click with no confirmation.
**Read: go for internal use once the contrast tokens are fixed. The Major items
should follow before the interview season.**

All findings are from source. Anything about runtime behaviour is marked
**potential — unverified** and should be spot-checked live (see Appendix).

## Findings

| # | Sev | Framework | Summary | Location |
|---|-----|-----------|---------|----------|
| 1 | 1 — Critical | WCAG 1.4.3 | Status colours used as text fail AA contrast (amber 1.7:1, green 3.1:1, red 3.9:1, neutral-400 ~2.6:1) | `globals.css:25-27`; usages listed below |
| 2 | 2 — Major | Nielsen #5 / Shneiderman #6 | Typed-but-unsaved slot times are discarded when changing table page | `interviews/SlotEntryTable.tsx:43-46, 131` |
| 3 | 2 — Major | Nielsen #5 / WCAG 3.2.2 | Seat picker assigns on `change` — no confirm step; keyboard arrowing can commit the wrong person | `interviews/PanelBoard.tsx:651` |
| 4 | 2 — Major | Shneiderman #6 / project rule | "Remove" interviewer and "Decline" request act on one click, no confirmation | `interviews/PanelBoard.tsx:605, 713` |
| 5 | 2 — Major | Nielsen #5 | Permanent Phase 2 notes/flags are committed on a single "Add" with no review or undo window | `phase2/EntrySection.tsx:165-173` |
| 6 | 2 — Major | Nielsen #1 | Notes/Flags tallies are hidden below 640px — red flags vanish on phones while collapsed | `phase2/ApplicantCard.tsx:157, 173` |
| 7 | 2 — Major | Interaction cost (Fitts/Hick) | Transcribing bookings is slow: no search in a 10-per-page table, Enter doesn't save, one Save per row | `interviews/SlotEntryTable.tsx` |
| 8 | 3 — Minor | Nielsen #6 / WCAG 1.3.1, 4.1.2 | Meaning carried only by visuals/tooltips: unlabeled tally columns, run-on button name, `aria-label` on a generic span, lock icon, Assign-vs-Request tooltip | `phase2/ApplicantCard.tsx`, `interviews/PanelBoard.tsx` |
| 9 | 3 — Minor | WCAG 4.1.3 | Inline errors, "Saved", and "Sent … to approve" aren't announced to screen readers | `EntrySection.tsx:177`, `SlotEntryTable.tsx:325-329`, `PanelBoard.tsx:~390-399` |
| 10 | 3 — Minor | Nielsen #7 | Phase 2 search is name-only — no committee / flag / year filter for the decision discussion | `phase2/RankedList.tsx:66` |
| 11 | 3 — Minor | Nielsen #1 | Other reviewers' changes appear only on manual Refresh, with no "something changed" cue | `phase2/page.tsx:92`, `interviews/page.tsx:294` |
| 12 | 3 — Minor | WCAG 2.4.7 | Custom toggles/textarea have no explicit focus style (rely on browser default) — potential, unverified | `ApplicantCard.tsx` toggle, `EntrySection.tsx` textarea/button, `PanelBoard.tsx` day toggle |
| 13 | 4 — Polish | WCAG 1.3.1 | `<h3>` nested inside the day-toggle `<button>` (invalid content model) | `interviews/PanelBoard.tsx:172` |

---

## Detailed findings

### 1. Status colours used as text fail AA contrast — Critical

**Framework:** WCAG 2.2 SC 1.4.3 (Contrast, Minimum). Corroborating: Nielsen #8
(aesthetic & minimalist design) and Shneiderman #2 (universal usability).

**Evidence (computed from the light-mode tokens against `#ffffff`; the
`/10`–`/15` tinted backgrounds lower these further, so treat them as upper
bounds):**

| Token | Hex | Contrast on white | Needed |
|---|---|---|---|
| `--status-pending` | `#fbbc05` | **1.7:1** | 4.5:1 |
| `--status-accepted` | `#34a853` | **3.1:1** | 4.5:1 |
| `--status-rejected` | `#ea4335` | **3.9:1** | 4.5:1 |
| `text-neutral-400` | ≈ `#a1a1a1` | **~2.6:1** | 4.5:1 |
| white on `--primary` / green / red buttons | — | 3.6 / 3.1 / 3.9:1 | 4.5:1 (12px text) |

All of these are small text (10–12px), so the 4.5:1 threshold applies. The
highest-impact usages are below.

- **Amber**:
  - The "Needs Interviewers — x/y filled" panel footer (`PanelBoard.tsx:430`, 10px bold). This is the board's main scan signal.
  - The "Not yet booked" badge (`booking-status-badge.tsx:19`).
  - "Pending approval" (`PanelBoard.tsx:576`).
  - The approval notice (`:275`).
  - Phase 2's "Partial score" (`ApplicantCard.tsx:198`) and "No answer found for this field".
  - The email panel's "Set the calendar link before sending".
- **Green**: "Scheduled", "Panel Complete", "Completed", "Saved", the Green Flags header and its tally pills.
- **Red**: inline error messages and the Red Flags header and pills.
- **Neutral-400**:
  - Phase 2's position number (`ApplicantCard.tsx:125`).
  - "Permanent — entries can't be edited or deleted" (`EntrySection.tsx:173`), the warning that matters most in finding 5.
  - "Nothing recorded yet."
  - The Slot table's column headers (`SlotEntryTable.tsx:147`).
  - The seat's "Open" label (`PanelBoard.tsx:636`).

Dark mode re-tunes `--status-*` (`globals.css:105-107`) and was not computed.

**Fix:** keep the bright hexes for fills, dots and borders, and add text-safe
siblings in `globals.css` that the text classes use instead:
`--status-pending-text`, `--status-accepted-text` and `--status-rejected-text`.
Darken each until it reaches ≥4.5:1 on both white and its own `/10` tint, for
example roughly `#8a6400` amber, `#1e7e34` green and `#c5221f` red; check the
final values with a contrast checker. Expose them via `@theme` as
`text-status-*-text`, and give each a `.dark` value. Replace `text-neutral-400`
with `text-neutral-500` (4.7:1) for any text that carries meaning. For the
white-on-colour buttons, either use the darker text-safe fill or raise the
label to 14px bold (large-text threshold 3:1).

### 2. Unsaved slot times are discarded on page change — Major

**Framework:** Nielsen #5 (error prevention); Shneiderman #6 (easy reversal).
**Status:** potential — unverified (derived from component structure, not observed).

**Evidence:**
- Each row's draft (`time`, `room`) lives in `useSlotDraft` state inside `SlotTableRow` / `SlotCard` (`SlotEntryTable.tsx:162-178`).
- The table renders only `rows.slice(...)` for the current page (`:46`).
- `onPageChange={setPage}` (`:131`) has no dirty check.

A coordinator who types times into several rows and then pages forward
unmounts those rows, which drops their state. When they come back, the fields
show the last saved values, with no warning.

**Fix:** lift drafts into a `Map<applicantId, {time, room}>` held in
`SlotEntryTable`, so they survive paging. Show a "N unsaved" count beside the
Pager, and confirm before a page change while any row is dirty.

### 3. Seat picker commits on `change` — Major

**Framework:** Nielsen #5; WCAG 3.2.2 (On Input) corroborating.
**Status:** potential — unverified (behaviour varies by browser and OS).

**Evidence:** `PanelBoard.tsx:651`. The `<select>`'s `onChange` immediately
calls `onAssign` / `onReassign` and closes the picker. On platforms where
arrow keys change a closed `<select>`'s value (Chrome and Firefox on Windows),
the first ArrowDown assigns whichever member is first in the list. A mouse
mis-click on an adjacent option commits in the same way. The board flashes and
saves before the lead has confirmed anything.

**Fix:** treat the select as a choice, not an action. Hold the value in local
state and add an explicit "Assign" button beside the existing "Cancel"
(`:~673`). Pressing Enter on the select can trigger the same button.

### 4. "Remove" interviewer and "Decline" act on one click — Major

**Framework:** Shneiderman #6. This also conflicts with the project rule in
AGENTS.md, which says confirmation is mandatory for destructive or
high-consequence actions.

**Evidence:**
- "Remove" calls `onUnassign()` directly (`PanelBoard.tsx:605`). It sits next to "Change", and both are `ghost` `sm` buttons (28px tall), so a mis-click is plausible.
- "Decline" answers another lead's request with no confirmation (`:713`), and that answer can't be withdrawn.
- Re-assigning restores a removed seat, but the interviewer has silently lost the seat in between.

**Fix:** route both through the existing `ConfirmDialog`, as Slot clearing
already does ("Remove {name} from {applicant}'s panel?"). Alternatively, show a
5-second inline "Removed — Undo" before the action commits.

### 5. Permanent Phase 2 entries are committed on a single click — Major

**Framework:** Nielsen #5; Shneiderman #6.

**Evidence:** `EntrySection.tsx:165` calls `submit()`, which writes an entry
that by design can never be edited or deleted. The only warning is the 11px
neutral-400 caption at `:173`, which fails contrast (finding 1). A typo, or a
red flag posted on the wrong applicant, can only be corrected by appending a
second entry, and that stays on the record that goes to the final decision.

**Fix:** keep the entries permanent, but add a short grace period. Commit after
about 8 seconds, with an inline "Posting… Undo" in the meantime. If that's too
much, use a confirm step for **Red Flags only**, since they carry the most
weight. Raise the warning caption to a passing contrast.

### 6. Notes/Flags tallies are hidden on phones — Major

**Framework:** Nielsen #1 (visibility of system status).

**Evidence:** both tally columns use `hidden … sm:flex`
(`ApplicantCard.tsx:157, 173`), so below 640px neither renders. The code's own
comment above them states the intent: "visible while collapsed, so a red flag
can't hide behind a closed card". That intent holds only at ≥640px.

**Fix:** below `sm`, show a compact red-flag count (an icon plus a number) on
the name line, even if notes and green flags stay hidden. Red is the one count
that must never hide.

### 7. Transcribing bookings costs too many actions — Major

**Framework:** interaction cost (Fitts/Hick); Nielsen #7 (flexibility &
efficiency) corroborating.

**Evidence:**
- **No search:** the Slot table pages 10 at a time in submission order (`SlotEntryTable.tsx:34`). To enter a booking from the calendar, the coordinator has to page through looking for a name.
- **Enter doesn't save:** the inputs aren't inside a `<form>`.
- **One Save per row:** every row needs its own Save click.

**Fix:**
- Add a name filter above the table, like Phase 2's search.
- Wrap each row in a `<form>` so Enter saves.
- Add a "Not yet booked only" toggle, since that is the working set during transcription.

### 8. Meaning carried only by visuals or tooltips — Minor

**Framework:** Nielsen #6 (recognition over recall); WCAG 1.3.1 and 4.1.2
corroborating.

**Evidence:**
- **Phase 2 tally columns** have no header or legend. The difference between a "—" (not permitted) and a blank (nothing yet) is explained only in code comments. The pills' meaning is only in `title` (`ApplicantCard.tsx:29`), which touch and keyboard users never see.
- **The applicant toggle's accessible name** is everything inside the `<button>`. That is roughly "3 Jane Doe TM · Year 1 · Licence 2 1 14.50 / 20", with no word saying which number is which.
- **The seat dots** put `aria-label` on a plain `<span>` (`PanelBoard.tsx:344`). ARIA doesn't name generic elements, so assistive tech may ignore it.
- **The lock icon** (`:616`) is `aria-hidden` and has no text.
- **Assign vs Request** is explained only in `title`.

**Fix:**
- Add a small column header row above the Phase 2 list ("Notes", "Flags", "Score").
- Give each pill an `sr-only` label ("2 red flags").
- Set an explicit `aria-label` on the toggle ("Jane Doe, rank 3, score 14.50 of 20, 2 red flags").
- Add `role="img"` to the seat-dot span.
- Replace title-only hints with visible helper text, or a popover that keyboard users can reach.

### 9. Status messages aren't announced — Minor

**Framework:** WCAG 4.1.3 (Status Messages, AA).

**Evidence:**
- Phase 2's add error (`EntrySection.tsx:177`).
- The Slot table's error and "Saved" (`SlotEntryTable.tsx:325-329`).
- The panel card's error and "Sent to that seat's lead to approve" notice.

All of these appear without `role="status"`, `role="alert"` or `aria-live`.

**Fix:** use `role="alert"` on the error paragraphs and `role="status"` on the
Saved and notice messages.

### 10. Phase 2 search is name-only — Minor

**Framework:** Nielsen #7.

**Evidence:** `RankedList.tsx:47-53` filters only on `fullName`. The page is
used live in discussion, where the questions are "TM applicants", "anyone with
a red flag" or "first-years". Each of those means scanning the whole list.

**Fix:** add committee chips (TM / MKT / EER) and a "Has red flag" toggle beside
the search box. Filter client-side, as the name search already does.

### 11. Others' changes appear only on manual Refresh — Minor

**Framework:** Nielsen #1.

**Evidence:**
- Both pages depend on `RefreshButton` (`phase2/page.tsx:92`, `interviews/page.tsx:294`), and both are multi-user surfaces.
- Phase 2: during a discussion, a reviewer can write a note that duplicates or contradicts one a colleague posted seconds earlier.
- Interviews: two leads can try to staff the same seat. The server catches this, but only after the action.

**Fix:** poll lightly, for example `router.refresh()` every 30–60 seconds while
the tab is visible. Or show a "Updated by others — refresh" pill when a cheap
version check differs. Re-syncing Phase 2's entries is already safe
(`EntrySection` adopts new payloads).

### 12. Custom controls lack an explicit focus style — Minor

**Framework:** WCAG 2.4.7 (Focus Visible).
**Status:** potential — unverified.

**Evidence:**
- The shadcn `Button` and `Input` define `focus-visible:ring-3`.
- The hand-rolled controls don't: the Phase 2 card toggle, the `EntrySection` textarea and Add button, and the board's day toggle.
- They fall back to the browser's default outline. Its colour is set to `ring/50` (50% blue) by `globals.css:204`.
- Whether that outline is visible, and how much contrast it has, depends on the browser. It needs a live check.

**Fix:** add `focus-visible:ring-3 focus-visible:ring-ring/50 outline-none` to
these controls, matching the shadcn primitives.

### 13. Heading nested inside a button — Polish

**Framework:** WCAG 1.3.1.

**Evidence:** the day toggle's `<button>` contains an `<h3>`
(`PanelBoard.tsx:172`). A button's content model is phrasing content only, so
heading navigation may not list the days.

**Fix:** put the `<h3>` outside the button and the button inside it
(`<h3><button aria-expanded>…</button></h3>`). This is the WAI-ARIA accordion
pattern.

---

## Appendix — not covered

- **Live behaviour:** none of this was observed in a browser. Findings 2, 3 and 12 need a live spot-check before anyone acts on them. That means real tab order, rendered focus rings, `<select>` keyboard behaviour on Windows, and the paging data-loss path.
- **Dark-mode contrast:** not computed. The dark tokens (`globals.css:100-107`) differ and need a separate check.
- **Interview Notes sub-page** (`interviews/[applicantId]/notes`), including `NoteEditor` and `RatingControl`: out of scope for this run.
- **The email panel**: read for confirmation and disabled-state handling, which both look sound (`ConfirmDialog` on both sends, inline reason when the calendar link is missing). Its layout and copy were not audited in depth.
- **The MKT Skills table**: read. It has semantic tables with headers and no issues beyond the shared contrast tokens. Its horizontal scroll at narrow widths was not observed.
- **Screen-reader testing**: no actual AT run. The accessible-name claims in finding 8 come from reading the markup.
- **Performance and loading states**: not assessed. The `loading.tsx` skeletons were added today and haven't been audited.

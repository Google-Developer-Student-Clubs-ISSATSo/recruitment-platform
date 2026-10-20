---
target: Phase 1 scoring page (src/app/(app)/campaigns/[campaignId]/phase1) — visual-only critique
total_score: 24
max_score: 36
na_heuristics: 10
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\krifa\\Desktop\\Tech\\GDGC Recruitment Platform\\recruitment-platform\\src\\app\\(app)\\campaigns\\[campaignId]\\phase1"
timestamp: 2026-10-19T23-04-04Z
slug: src-app-app-campaigns-campaignid-phase1
---
# Critique — Phase 1 Scoring Page (visual-design scope only)

Method: dual-agent (A: ses_ea99b5b42ffeTvKKZLRDPI3PEu · B: ses_ea99b5b40ffeJhBpgGVgzyy4Q4)

**Scope requested by user:** layout, density, hierarchy, spacing, typography only. Dark theme, LG+ workstation view, applicant with all answers filled. No file changes made.

**Screenshot caveat:** no image attachment was received by the agent; findings are grounded in source class analysis (converted to px values) and verified against DESIGN.md tokens.

## Design Health Score (visual-relevant scope)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Weighted total and failed-save alert scroll out of view during scoring |
| 2 | Match System / Real World | 4 | Operator language, natural left-to-right question/scale order |
| 3 | User Control and Freedom | 3 | Revert exists; but scores leave viewport mid-task |
| 4 | Consistency and Standards | 3 | 34px buttons vs 32px spec; arbitrary text-[Npx] values |
| 5 | Error Prevention | 3 | Save-disabled transitions + named alert present |
| 6 | Recognition Rather Than Recall | 2 | Answer↔score-row spatial mapping lost after question 1 |
| 7 | Flexibility and Efficiency | 2 | Irregular row rhythm at long questions breaks level scanning |
| 8 | Aesthetic and Minimalist Design | 2 | Over-chromed cards, 3 stacked chrome bands, inverted emphasis |
| 9 | Error Recovery | 3 | Named self-explanatory alert; form state preserved |
| 10 | Help and Documentation | n/a | Out of visual scope / none on this surface |
| **Total** | | **24/36** | Acceptable band — fixable with layout-only changes |

## Design Specificity Verdict

**LLM assessment.** Authored for an operator console in its *motion and control* language (pick beat, 32px queue rows, tabular-nums), but its *composition* has drifted generic: a scroll-from-scratch two-pane form rather than a workstation. The signature rule "Score = the only display-size number, reserved for the thing being decided" is present in type treatment but lost in placement — the number scrolls away, so the console metaphor breaks at exactly the moment it matters.

**Deterministic scan.** 24 advisory findings, all `design-system-font-size` (`text-[Npx]` literals off DESIGN.md's ramp): ProcessedRemainingCounter.tsx:20,32 (20px), Phase1ScoringClient.tsx:346 (18px), :519 (32px — empty-state icon, false positive), ApplicantQueueList.tsx:152,157,180 (icon sizes — false positives). The 10px/16px findings live in `selection/` (out of scope today). Agrees with the design review on real signal: counter and header type sizes are hand-picked arbitrary values.

## What's Working

1. **ScoringControl row composition** — question text left, scale at the right edge on one line; buttons ~34px with selected = solid primary + white ink, exactly the DESIGN.md signature score-button spec. One glance per question.
2. **ApplicantQueueList rail** — 260px fixed rail, uppercase 11px header strip, active row with `layoutId` sliding bar, ~60px rows with 70vh capped internal scroll. Spec-correct.
3. **Motion discipline** — 200ms pick beat as save receipt, opacity-only crossfades, reduced-motion fallbacks everywhere. All within the 0.3s cap.

## Priority Issues (visual scope, ranked)

### 1. [P1] Decision-critical chrome scrolls out of view — nothing in the detail column sticks
- **Component:** `Phase1ScoringClient.tsx` (detail-pane sections; WeightedTotalDisplay row)
- **Confirmed suspicion #2.** Only the queue rail's list has capped internal scroll; both remaining `<section>`s scroll with the document. The weighted total ("the only display-size number, reserved for the thing being decided"), the Scoring section, and the failed-save alert all leave the viewport once the reviewer reaches question ~4. More than half a 1080p viewport is consumed before content (`≈474px` from viewport top to first answer text).
- **Fix direction:** make the applicant header row (name + WeightedTotalDisplay) `lg:sticky lg:top-…`, or give the scoring column its own `max-h + overflow-y-auto` with the title sticky inside scores-and-total stay permanently on screen beside whichever answer is being read.

### 2. [P1] Answer card and its score row drift apart after question 1
- **Components:** `src/components/applicant-answer-panel.tsx` (variable-height `p-4` cards + `space-y-4`) ↔ `Phase1ScoringClient.tsx` score rows (fixed ~58px `p-3` rows + `space-y-2.5`)
- The two side-by-side columns have different vertical rhythms: one extra answer line in a card shifts every subsequent score row relative to its question. "Which scale did I pick for this answer?" becomes a hunting exercise instead of a level scan.
- **Fix direction:** normalize both columns to a shared per-question row height — clamp answer cards (line-clamp + expand, or fixed max-height with internal scroll) and match the score-row rhythm so question N sits at the same y in both columns.

### 3. [P2] Answer cards are over-chromed for short answers, with emphasis inverted
- **Component:** `src/components/applicant-answer-panel.tsx` (`rounded-xl border p-4` full mode)
- **Confirmed suspicion #1.** A one-line URL answer costs a ~83px card of which only ~20px is content — the cost is padding + chrome, not the number of questions. Emphasis is inverted: the question (`text-sm font-semibold text-foreground`) is the brightest ink in the card; the answer being judged is muted (`dark:text-neutral-300`).
- **Fix direction:** tighten to `px-4 py-3`, demote the question to 12px medium muted, and let the answer take `text-foreground` — the answer should be the brightest thing in the card.

### 4. [P2] Three stacked bands before any content (title, counter banner, applicant header)
- **Component:** `ProcessedRemainingCounter.tsx` (main contributor)
- **Partly confirmed suspicion #3.** ~56px h1 + ~90px full-width counter banner (`px-5 py-3.5` + `gap-4` wrap pushing the caption to its own line) + ~98px applicant header. The counter's numbers are correctly `tabular-nums` but compete with a 20px icon and a wrapping caption inside a fat bordered card.
- **Fix direction:** merge the counter into the page title row as a slim inline strip (`px-3 py-2`, 16px icons or none, `text-sm tabular-nums`, caption inline) and reclaim ~50px.

### 5. [P2] Score-row height is unpredictable at long questions, and the coefficient is nearly invisible
- **Component:** `Phase1ScoringClient.tsx` score row (`flex flex-wrap` + `text-[11px] text-neutral-400` coefficient)
- Two-line questions push the scale below the text (`58px → ~90-100px` rows), so rhythm becomes irregular exactly at the heavy questions. The decision-critical `×n` coefficient is the faintest text on the panel — the only way to sanity-check the weighted total.
- **Fix direction:** `grid grid-cols-[1fr_auto]` with a stably-centered scale and the question clamped to two lines; lift the coefficient to `text-xs` `tabular-nums` and a step brighter.

## Minor Observations

- `WeightedTotalDisplay.tsx`: 98px incomplete state; "partial" label + explanatory line say the same thing — fold to save ~18px.
- Score buttons measure 34px, not the 32px spec (`text-sm` line + `py-1.5` + border).
- Failed-save alert sits *under* the "Scoring" label and shifts every row down 8px on an already-failing save.
- Queue rail chrome (~100px header + search) could merge to ~64px once the counter moves into the title bar.
- `text-[Npx]` literals: 24 advisory detector findings; real signal in ProcessedRemainingCounter + Phase1ScoringClient header type; icon-size strings are false positives.

## Vertical budget (lg+, 8 questions, 2-line answers)

- One score line: `58px + 10px gap = 68px`; matched answer card `83–129px + 16px gap`.
- Detail-pane top → first answer text: `≈184px`; viewport top → first answer text: `≈474px`.

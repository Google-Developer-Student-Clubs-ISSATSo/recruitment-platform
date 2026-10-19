---
target: Phase 1 scoring page (Phase1ScoringClient.tsx)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\krifa\\Desktop\\Tech\\GDGC Recruitment Platform\\recruitment-platform\\src\\app\\(app)\\campaigns\\[campaignId]\\phase1\\Phase1ScoringClient.tsx"
target_fingerprint: "sha256:e1572f3612165dc7db6e803e29e9044b5cc5c3cf7e1a06b7de9a9ed6b56ae86d"
target_path: "C:\\Users\\krifa\\Desktop\\Tech\\GDGC Recruitment Platform\\recruitment-platform\\src\\app\\(app)\\campaigns\\[campaignId]\\phase1\\Phase1ScoringClient.tsx"
timestamp: 2026-10-19T22-10-27Z
slug: campaignid-phase1-phase1scoringclient-tsx-07ba5d72
---
# Critique — Phase 1 Scoring Queue (`Phase1ScoringClient.tsx`)

**Method: dual-agent** (A: design review `ses_ea9ce3ff3ffexh6J4LvsJOmfVj` · B: detector scan `ses_ea9ce3ff1ffeJZ5o9vlIkgBxWh`). No browser tool in this session; Assessment B is the CLI detector only.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "Saved" receipt on the note unanswered in the normal save path (false "Unsaved changes"); score saves not announced |
| 2 | Match System / Real World | 4 | Screener vocabulary throughout; partial states honest |
| 3 | User Control and Freedom | 2 | Unsaved note draft destroyed on applicant switch; no way to un-set a score |
| 4 | Consistency and Standards | 4 | Token discipline real; two-tier focus treatment |
| 5 | Error Prevention | 2 | No undo window on instant-write scores; no guard on switch-with-draft |
| 6 | Recognition Rather Than Recall | 3 | Answers↔scoring rows aligned by position only |
| 7 | Flexibility and Efficiency | 1 | Zero keyboard accelerators on a page that exists to be looped |
| 8 | Aesthetic and Minimalist Design | 4 | Flat + hairlines + status ink, exactly per DESIGN.md |
| 9 | Error Recovery | 2 | Optimistic revert is correctly coded, but recovery lives off-stage, no aria-live, no Retry |
| 10 | Help and Documentation | 2 | Save-contract copy load-bearing; nothing anchors scale digits |
| **Total** | | **27/40** | Good band — strong surface, weak operation |

## Design Specificity Verdict

**Authored, genuine (≈8/10).** A real implementation of DESIGN.md's "Operator's Console": scale-driven Score Button with pop-as-receipt, status ink disciplined (minor wobble: `text-[color:var(--status-pending)]` in ProcessedRemainingCounter/applicant-answer-panel instead of `text-status-pending`), motion tokens imported, save-on-pick contract stated in copy. The operation, however, is generic — the loop (score → finish → next) has no steering wheel: no filter, no hotkeys, no next-incomplete jump.

**Deterministic scan:** 28 advisory findings, all `design-system-font-size`. 25 false positives (icon glyph sizing sanctioned by DESIGN.md); 3 genuine: real-text badges at 10px — `Phase1ScoringClient.tsx:270`, `SelectionClient.tsx:586, 833` — one ramp step below the 11px Meta.

## What's Working

1. Coherent save-receipt language across three write rhythms (pulse-on-pick; "Saved"/"Unsaved changes" note line; RefreshButton spinner) — the interface explains its own I/O model.
2. Honest partial states everywhere — "(partial)" total, "Not scored yet"+lock, `3/7 scored` rail rows, "No answer found" vs "Not provided".
3. Boring correctness under the polish — id-keyed optimistic revert, type-enforced icons, 0.3s motion ceiling with universal reduced-motion collapses.

## Priority Issues (most important first)

**1 · [P1] No keyboard accelerators on a high-loop page** — `Phase1ScoringClient.tsx`, `ApplicantQueueList.tsx`, `ScoringControl.tsx`. No digit keys for scale values, no j/k prev-next, no next-incomplete jump (initial selection once at mount only), no rail filter/search, no roving tabindex. Keyboard cost O(queue size); mouse ceiling ~9s/applicant. Fix: listbox pattern in the rail; global keydown (1..n = score, j/k = navigate, Shift+N = next incomplete); "Next incomplete →" beside WeightedTotalDisplay.

**2 · [P1] ScoringNote reports false state after saving** — `ScoringNote.tsx:37–50, 76–90`. `initialNote` prop is never advanced after a successful save, so `dirty` stays true: "Unsaved changes" shows right after "Saved", Save never disables, `savedFlash` is dead code. Fix: keep a `savedBaseline` state, set on `res.ok`, derive `dirty` from it.

**3 · [P1] Switching applicants destroys the unsaved note draft (and focus)** — `Phase1ScoringClient.tsx:190–202, 300–309` + `ScoringNote.tsx`. Keyed remount on `selected.id` wipes drafts without warning and drops focus to body. Fix: hoist draft state (`Record<applicantId, draft>`) or explicit dirty-check + ConfirmDialog before leaving a dirty note; restore focus after switch.

**4 · [P2] Failed-save recovery lives off-stage** — `Phase1ScoringClient.tsx:164–168`. Top-of-page red banner, no `aria-live`/`role="alert"`, no Retry; may be scrolled away by the 70vh rail. Fix: aria-live alert near the Scoring panel header with one-click Retry ("Save 0.5 again"); guard the optimistic revert against a refreshed payload landing mid-flight (Riley race).

**5 · [P2] One in-flight save disables every score button globally** — `Phase1ScoringClient.tsx:283` → `ScoringControl.tsx:99`. Blanket `pending` locks all rows, no indicator of which write is slow, disabled buttons stop firing Enter mid-sequence. Fix: per-`(applicantId, questionId)` pending set, `aria-disabled` + opacity instead of `disabled`, saving dot on the slow row.

**6 · [P2] 1000-row unvirtualized rail with no filter/search** — `ApplicantQueueList.tsx:45–115`. DOM weight + impossible visual scan + unbounded Tab sequence; team-wide Processed/Remaining not labeled as such. Fix: "Unscored only" default filter chip, name search, windowed rendering if sizes warrant, caption on the counter; numbered/hover-linked row correspondence between answer cards and scoring rows.

## Persona Red Flags

- **Alex (power user, 60 applicants):** Keyboard-only impossible; no accelerators; mouse ~9s/applicant; the global pending seizure is the first thing he notices. Hotkeys by Friday.
- **Sam (screen reader / keyboard-only):** Good semantic bones (aria-pressed, aria-current, role=group, live note status, labelled textarea); score saves announced as nothing; crossfade amputates focus on every switch; disabled={pending} yanks buttons mid-sequence; score cluster lacks accessible name/radiogroup semantics.
- **Riley (stress, 1000 applicants):** Mid-flight switch handled correctly; failures: unvirtualized rail, silent unsaved-note loss, stranded-by-banner on failed save, refresh-vs-revert race on the optimistic path.

## Minor Observations

- `ProcessedRemainingCounter.tsx:32`, `applicant-answer-panel.tsx:188`: `text-[color:var(--status-pending)]` where `text-status-pending` exists — call-site idiom drift.
- Double empty state when queue is empty (rail + detail pane both render "No applicants to score").
- Score buttons adjacent with no dead zone (min-w-8, gap-1.5) — misclick insurance gap is ~2px.
- "Technical scorers only see…" footer has the same visual weight as the transient error banner; muted footnote style would make errors pop.
- "Technical" badge at 10px text (detector finding) — bump to the 11px Meta ramp line.

## Questions to Consider

1. If a pick is a write, is a 3-second "Saved 0.5 · Undo" cheaper than the confidence of never having to double-check?
2. Does finishing an applicant deserve a beat — auto-advance vs explicit "Next incomplete", and should a sequencer be visually distinct from a browsable rail?

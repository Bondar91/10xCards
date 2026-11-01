<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manual Flashcard Create (S-04)

- **Plan**: context/changes/manual-flashcard-create/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-11-01
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated checks re-run during the review: `npm test` (67 passed), `npm run lint` (0 problems), `npm run build` (Complete).

Safety notes checked with no finding:

- The `POST` route explicitly picks `front`, `back` and `source: "manual"`, so `source`, `user_id` and `generation_id` cannot be injected through the body.
- RLS `flashcards_insert_own` is the second line of defence.
- Astro's default `checkOrigin` covers cross-origin `text/plain` POSTs.
- JS UTF-16 length is never looser than the DB's `char_length`.

## Findings

### F1 — cpuTime criterion checked without a recorded value

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/manual-flashcard-create/plan.md:318, change.md (Evidence)
- **Detail**: Progress 3.6 "`wrangler tail` cpuTime for POST recorded" is `[x]`, but the evidence only says "within the Workers limit (exact value not recorded)". The same gap was left open in S-03 for `GET /api/flashcards`, so the deck routes still have no measured CPU baseline.
- **Fix**: Capture one `wrangler tail` sample for `POST /api/flashcards` (and `GET`, to close the S-03 gap) and add the numbers to the Evidence in change.md.
- **Decision**: ACCEPTED — user accepted production verification without a recorded cpuTime value (2026-11-01)

### F2 — Form-state design deviates from the plan without an addendum

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/deck/NewFlashcardForm.tsx:33, src/components/deck/FlashcardDeck.tsx:58-75
- **Detail**:
  - **What the plan says**: a `defaultOpen` prop, with the form rendered in the empty state and again in the list view.
  - **What was built**: one form instance mounted above spinner, empty state and list, with a `forceOpen` prop that latches `open` during render.
  - **Why**: the empty state is replaced by the spinner during the page-1 reload, which would unmount the form and lose the "stay open, focus Przód" behaviour.
  - **Problem**: the reason was explained in chat but not recorded in the change folder, so a later reader sees an unexplained drift.
- **Fix**: Add a short "Implementation deviations" note to change.md `## Notes` that describes `forceOpen`, the single mounted form and the reason.
- **Decision**: FIXED — "Implementation deviations" note added to change.md

### F3 — Successful create from an empty deck can land on the error screen

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useFlashcardDeck.ts:152, src/components/deck/FlashcardDeck.tsx:41-55
- **Detail**:
  - **Trigger**: the `POST` succeeds but the following page-1 reload fails (transient DB or network error). `applyPage` then sets `status: "error"` while `cards` is still `[]`.
  - **Result**: `FlashcardDeck` takes the early "error with no cards" return. The form unmounts, and the user sees "Spróbuj ponownie" although the card was saved.
  - **Impact**: no data loss, and "Spróbuj ponownie" shows the card. Rare and self-healing.
- **Fix**: Accept as-is, or keep the form mounted in the error branch too.
- **Decision**: FIXED — error branch in FlashcardDeck.tsx now keeps NewFlashcardForm mounted (no early return)

### F4 — Opening the new-card form discards an unsaved edit draft

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/deck/FlashcardDeck.tsx:68 (`onOpen` → `setActive(null)`)
- **Detail**: Clicking "Dodaj fiszkę" while a card is in edit mode closes it and drops its typed draft without a prompt. The plan specified this behaviour, and it matches how switching between cards already works in S-03, but nothing tells the user the draft was dropped.
- **Fix**: Accept as planned behaviour.
- **Decision**: ACCEPTED — planned behaviour, consistent with S-03 card switching

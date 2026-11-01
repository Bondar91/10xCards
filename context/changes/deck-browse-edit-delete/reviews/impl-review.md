<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Deck Browse, Edit & Delete (S-03)

- **Plan**: context/changes/deck-browse-edit-delete/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-11-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Plan drift: every contract item in Phases 1–3 is MATCH. Known deviations: the `ProposalSchema` alias was removed, `FlashcardDeck` uses a named export, and the hook steps back over any empty page. Benign extras: the 503 `config` branch, the "Fiszek w talii" counter, and `total`/`busyId`/`reload` in the hook.

Rejected sub-agent findings:
- "`flashcards_user_id_idx` is redundant": it was already dropped in `20261031220000_harden_review_flashcard.sql:9`.
- "PATCH has no 409": optimistic concurrency is explicitly listed in the plan's "What We're NOT Doing".

## Findings

### F1 — Pagination stays clickable while a DELETE/PATCH is in flight

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/deck/FlashcardDeck.tsx:117, src/components/deck/FlashcardDeck.tsx:131 (+ src/components/hooks/useFlashcardDeck.ts:113, :137)
- **Detail**:
  - The Poprzednia/Następna buttons check only `loading`, not `busyId`.
  - Scenario: the user clicks "Następna" while a DELETE is in flight, so `reloadAt(page+1)` starts.
  - The DELETE then finishes and calls `reloadAt(page)` with the page value it captured when it started. That call gets a newer `requestSeq`, so it wins and silently sends the user back to the previous page.
- **Fix**: Add `deck.busyId !== null` to the `disabled` condition on both pagination buttons.
- **Decision**: FIXED — `navLocked = loading || busyId !== null` on both pagination buttons

### F2 — `npm run lint` fails repo-wide although 1.4 / 2.1 / 3.1 are checked

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: src/db/database.types.ts, eslint.config.js, src/pages/*.astro
- **Detail**:
  - `npm run lint` reports 292 errors.
  - 275 are prettier errors in the generated `database.types.ts`. The `supabase gen types` output is not formatted, and HEAD~ had the same format.
  - The rest:
    - prettier errors in `eslint.config.js`, `button.tsx` and `FormField.tsx`;
    - one parsing error in each `.astro` file. `flashcards.astro` is new, so this change adds one more.
  - All new `.ts`/`.tsx` files lint clean. CI (lint + build on push to main) will fail on lint.
- **Fix**: Add `src/db/database.types.ts` to the ESLint `ignores` (generated file) and run `npm run lint:fix` on the remaining prettier errors. Diagnose the `.astro` parsing errors separately (the `eslint-plugin-astro` / prettier config).
  - Strength: unblocks CI without hand-editing a generated file, which would be overwritten by the next `gen types`.
  - Tradeoff: the `.astro` parsing issue needs its own investigation. It is outside the scope of S-03.
  - Confidence: MED — the ignore is certain; the cause of the `.astro` errors is unknown.
  - Blind spot: the last CI run on GitHub was not checked (`gh run list` returned nothing).
- **Decision**: FIXED — added `.prettierrc.json` (plugins: astro + tailwindcss; the missing config was why `.astro` failed to parse), ESLint `ignores` for `src/db/database.types.ts`, `npm run lint:fix` (formatting only in 15 files). `npm run lint` exit 0

### F3 — `fetchPage` steps back one page per request

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useFlashcardDeck.ts:30-42
- **Detail**:
  - After mass deletes in another tab, a user on page N makes up to N sequential requests. Each request runs `count: "exact"`, and the PGRST103 path runs a second count on top.
  - Every response already returns `total`.
- **Fix**: When `cards` is empty and `page > 1`, jump straight to `max(1, ceil(total / pageSize))`. That costs at most one extra request.
- **Decision**: FIXED — on an empty page, jump to `min(page - 1, ceil(total / pageSize))` instead of stepping back one page at a time

### F4 — Deleted card stays on screen when the reload after DELETE fails

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useFlashcardDeck.ts:121-138
- **Detail**:
  - The DELETE succeeds, then `reloadAt` gets an error. `applyPage` sets `status: "error"` and leaves the old `cards` in place.
  - The deleted card stays visible with active buttons. Clicking it gives 404 → "Ta fiszka już nie istnieje." No corruption, just confusing UX.
- **Fix**: After a successful DELETE, remove the id from `cards` locally (`setCards(prev => prev.filter(...))`) before `reloadAt`.
- **Decision**: FIXED — `setCards(prev => prev.filter(...))` after a successful DELETE, before `reloadAt`

### F5 — Mount effect has no cleanup

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/hooks/useFlashcardDeck.ts:69-74
- **Detail**: `useReviewSession.ts:65-71` uses a `cancelled` flag in its cleanup. Here a request that is still in flight after unmount still sets state. It is harmless in React 19 and `requestSeq` handles StrictMode, but the pattern differs from the existing hook.
- **Fix**: `return () => { requestSeq.current++; };` in the effect.
- **Decision**: FIXED — a `cancelled` flag in the effect cleanup (the `useReviewSession` pattern; incrementing the ref in the cleanup triggered the `exhaustive-deps` warning)

### F6 — Phase 4 manual checks marked done without production verification

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/deck-browse-edit-delete/plan.md (4.3–4.6), change.md `## Evidence`
- **Detail**:
  - 4.3–4.6 are `[x]`, but none of these was verified on production:
    - two-account isolation;
    - the end-to-end flow;
    - `cpuTime` for `GET /api/flashcards`;
    - regressions.
  - The user decided that local verification was enough. This is recorded in Evidence, so it is not a hidden rubber-stamp. Same precedent as S-05 4.4.
- **Fix**: At the next `wrangler tail`, record `cpuTime` for `GET /api/flashcards` and run the two-account check. Add the results to Evidence before or after the archive.
- **Decision**: ACCEPTED — the user decided that local verification is enough; the decision is recorded in change.md Evidence

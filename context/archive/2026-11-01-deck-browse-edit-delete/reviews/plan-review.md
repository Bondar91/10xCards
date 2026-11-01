<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Deck Browse, Edit & Delete (S-03)

- **Plan**: context/changes/deck-browse-edit-delete/plan.md
- **Mode**: Deep
- **Date**: 2026-11-01
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 2 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding
6/6 existing paths ✓ (new paths src/pages/api/flashcards/, src/components/deck/ correctly absent), 4/4 symbols ✓ (ProposalSchema, requestJson, bodyTooLarge, review_flashcard), brief↔plan ✓, Progress↔Phase ✓ (4 phases; 5+3, 3+4, 3+7, 2+4 items)

## Findings

### F1 — Re-exporting ProposalSchema pulls astro:env into vitest

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §4 Deck service helpers
- **Detail**: The plan has `src/lib/services/flashcards.ts` re-export `ProposalSchema` from `flashcard-generator.ts`. That module imports `ai-client.ts`, which imports `astro:env/server` (ai-client.ts:1). `vitest.config.ts` deliberately avoids the Astro Vite config, so `astro:env/server` cannot be resolved. `flashcards.test.ts` would fail to load, and criterion 1.3 cannot pass.
- **Fix**: Move `ProposalSchema` into a dependency-free module (`src/lib/services/flashcards.ts` as `FlashcardContentSchema`, built on `flashcard-limits.ts`) and have `flashcard-generator.ts` and `save.ts` import it from there, so there is one schema and no import of AI code.
- **Decision**: FIXED

### F2 — Page past the end returns 416, not an empty 200

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1 List route; criterion 2.4
- **Detail**: PostgREST with `count=exact` answers `416 / PGRST103` when offset > total (RangeQuery.hs: `lower > total = status416`; confirmed via Context7). supabase-js surfaces this as an error, so `?page=999` → 500, contradicting criterion 2.4 ("past-end → 200 empty"). It is also reachable in the UI: delete cards in another tab, then paginate, or start with an empty deck on page > 1. The UI's "empty page → go back one" logic would never get an empty page; it would get an error. (offset == total does NOT 416, so the single-tab delete-last-card case is fine.)
- **Fix**: In the list route, treat error code `PGRST103` as "past the end": run a `head: true, count: "exact"` query and return `200 { cards: [], total, page, pageSize }`. Add a note to Critical Implementation Details.
- **Decision**: FIXED

### F3 — RETURNS TABLE column names collide in plpgsql

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1 Migration — update_flashcard_content
- **Detail**: In plpgsql, `RETURNS TABLE (id, front, back, source, created_at)` declares OUT variables with the same names as `flashcards` columns. Unqualified `where id = …` or `set front = …` expressions raise "column reference is ambiguous" on the first call. The existing RPCs avoid this: they return void or int, or are written in SQL. Also, `RETURNS TABLE` makes supabase-js return an array, which the route would have to unwrap.
- **Fix**: Declare `returns public.flashcards` (a single row, not `setof`) and `return` the updated row, or alias every column reference (`f.id`). The route then receives an object, and `toFlashcardDto` maps it.
- **Decision**: FIXED

### F4 — Phase 4 says "apply migration to production" but Phase 1 already pushes it

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §2 / Phase 4 Overview
- **Detail**: `npx supabase db push` targets the linked (production) project, the same setup as S-05, so the migration lands in Phase 1, before any code. That is harmless because the migration is purely additive, but Phase 4's wording implies a second step that doesn't exist.
- **Fix**: Reword the Phase 4 overview to "verify the migration (pushed to the linked project in Phase 1) on production" and note in Migration Notes that the push happens in Phase 1.
- **Decision**: FIXED

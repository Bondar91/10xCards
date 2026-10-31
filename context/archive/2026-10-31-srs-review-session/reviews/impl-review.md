<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: SRS Review Session

- **Plan**: context/changes/srs-review-session/plan.md
- **Scope**: Full plan (Phases 1–4 of 4)
- **Date**: 2026-10-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Notes:
- **Plan Adherence**: every contract item is implemented. Five benign deviations were verified, and all were reported during implementation:
  - an explicit `user_id = auth.uid()` filter in `get_review_queue`;
  - Polish plural forms in `formatInterval`;
  - a `p_last_review` override in the route;
  - extra `cardToRow` / `SRS_COLUMNS` exports;
  - `ReviewGrade` aliased to `ReviewRating`.
- **Scope Discipline**: every "What We're NOT Doing" item was respected. The Phase 1 commit also contains unrelated toolkit/config files; the user chose this explicitly.
- **Automated criteria**: re-run on 2026-10-31. `ts-fsrs` is 5.4.2, `vitest` 33/33, `npm run build` passes, `eslint` passes on all new files.

## Findings

### F1 — Progress 4.4 checked without recorded cpuTime

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/srs-review-session/plan.md:398
- **Detail**: Row 4.4 says "`cpuTime` for review routes recorded within limit", but `change.md` Evidence and `infrastructure.md:80` both state that the numbers were not recorded. The user confirmed production works but skipped the measurement.
- **Fix**: Record `cpuTime` for both routes from `wrangler tail` into `change.md` and `infrastructure.md`. If it will not be measured, reword the evidence to "accepted without measurement".
- **Decision**: FIXED — evidence reworded: 4.4 accepted without measurement (change.md)

### F2 — Non-finite SRS values pass RPC range checks and can break a user's queue

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261031210000_srs_review_state.sql:158-166 (and the log checks below them)
- **Detail**: The range checks use `< 0`. In Postgres, `'NaN'::float8` sorts above every number, and `'Infinity'` and `'infinity'::timestamptz` are positive, so all of them pass. `p_last_review` is also not validated.
  - Verified locally: with `due = 'infinity'`, ts-fsrs throws `Invalid date:[infinity]`, so `/api/reviews/queue` returns 500 for that user on every request. With `stability = NaN`, the result is an `Invalid Date`.
  - Only a direct PostgREST call to `review_flashcard` can write such values (accepted risk F4 in the plan), and it affects only the caller's own cards. The plan's range checks were meant to keep forged values plausible.
- **Fix**: Add a follow-up migration that recreates `review_flashcard` with `isfinite(p_due)`, `isfinite(v_log_due)` and `isfinite(v_review)`. Reject `'NaN'` and `'Infinity'` for stability/difficulty (both card and log). Require `p_last_review` to be non-null and within 300 s of `now()`.
  - Strength: Closes the gap at the only write path; same pattern as the existing checks.
  - Tradeoff: A new migration and another `db push` to production.
  - Confidence: HIGH — behaviour reproduced with ts-fsrs 5.4.2 locally.
  - Blind spot: Not tested end-to-end against Postgres via PostgREST JSON. PostgREST may reject the JSON literal `NaN`, but the string `"NaN"` coerces to float8.
- **Decision**: FIXED — migration 20261031220000_harden_review_flashcard.sql (isfinite / NaN / Infinity checks, p_last_review window), pushed to Supabase Cloud; generated types unchanged

### F3 — Uncaught throw after a committed rating

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/reviews/index.ts:111-118
- **Detail**: `intervalLabels(cardToRow(card), now)` and `shouldRequeue` run after `review_flashcard` has committed and are not wrapped in try/catch. If either throws:
  - the rating is saved but the client gets Astro's default 500 instead of `jsonError`;
  - a retry gets a silent 409, so the card is not re-queued and `ratedCount` misses that rating.
  The probability is low, but the queue route already guards the same call.
- **Fix**: Compute `intervals` and `requeue` before calling the RPC, inside the existing `rateCard` try/catch, and return them after the RPC succeeds.
- **Decision**: FIXED — response computed before the RPC inside the rateCard try/catch (src/pages/api/reviews/index.ts)

### F4 — Worker/DB clock gap can show "Brak fiszek" to a user with cards

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/reviews/queue.ts:52-59
- **Detail**: The queue RPC decides what is due with the database's `now()`, but the `nextDueAt` lookup filters `.gt("due", workerNow)`. A card with `dbNow < due <= workerNow` falls into neither query. `nextDueAt` is then null, and the UI shows "Brak fiszek — wygeneruj pierwsze".
- **Fix**: Drop the `.gt("due", …)` filter. When the queue is empty, the earliest `due` is by definition the next one.
- **Decision**: FIXED — dropped `.gt("due", now)` from the nextDueAt lookup (src/pages/api/reviews/queue.ts)

### F5 — Duplicated request helper across hooks

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/hooks/useReviewSession.ts:20-74
- **Detail**: `requestJson`/`postJson`, `FALLBACK_MESSAGE`, `NETWORK_MESSAGE` and the result type are copied from `useFlashcardGeneration.ts:41-79`. The plan said to follow that hook's pattern, so this is expected, but there are now two copies to keep in sync.
- **Fix**: Extract it to `src/lib/request-json.ts` with the status-message map as a parameter, and use it from both hooks.
- **Decision**: FIXED — extracted src/lib/request-json.ts; both hooks use it

### F6 — Redundant flashcards_user_id_idx

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261031210000_srs_review_state.sql:20
- **Detail**: The new `(user_id, due)` index has `user_id` as its leading column, which makes `flashcards_user_id_idx` (`user_id` only) redundant. The cost is extra write overhead and storage.
- **Fix**: Drop `flashcards_user_id_idx` in a follow-up migration (it can be bundled with F2).
- **Decision**: FIXED — flashcards_user_id_idx dropped in 20261031220000_harden_review_flashcard.sql

### F7 — Generated type marks get_review_queue.last_review as non-null

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/db/database.types.ts:215
- **Detail**: Supabase type generation marks every column of a set-returning function as non-null. `last_review` is null for New cards. Runtime is fine because `SrsRow.last_review` is `string | null` and `rowToCard` handles null. Only the typing is loose.
- **Fix**: Accept it. Generated types are not hand-edited, and the consumer type is already correct.
- **Decision**: SKIPPED — accepted; generated type left as is, SrsRow handles null

### F8 — "Kontynuuj (N zostało)" is a snapshot estimate

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useReviewSession.ts:165
- **Detail**: `remaining = dueTotal − batchSize` comes from the queue response. Cards rated in another tab still count, and cards that became due during the session do not. The worst case is that "Kontynuuj" leads to the empty state, which is handled.
- **Fix**: Add a code comment noting that the value is an estimate. No behaviour change.
- **Decision**: FIXED — comment on `remaining` in useReviewSession.ts

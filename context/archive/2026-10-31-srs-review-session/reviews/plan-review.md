<!-- PLAN-REVIEW-REPORT -->
# Plan Review: SRS Review Session

- **Plan**: context/changes/srs-review-session/plan.md
- **Mode**: Deep (inline verification)
- **Date**: 2026-10-31
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

7/7 existing paths ✓ (new files correctly absent), symbols ✓ (`createServerClient<Database>`, `FlashcardGenerator.tsx:12-15` button constants, `infrastructure.md:80`), Supabase CLI linked ✓, Progress↔Phases ✓ (4/4 phases, 30/30 items), brief↔plan ✓. Blast radius: only other `flashcards` read is the head count in `dashboard.astro:11`, which new columns don't affect.

## Findings

### F1 — Re-queued card is shown before its due (learn-ahead)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — useReviewSession (requeue); Phase 1 — shouldRequeue
- **Detail**: When the re-queued card is the last one, it reappears immediately although its label said "1 min"/"10 min"; two "Dobrze" ratings take a New card through both learning steps in seconds. The plan left this to the implementation.
- **Fix A**: Wait until `due` with a "Następna karta za X min" screen (server returns `dueInMs`).
- **Fix B ⭐ Recommended**: Keep learn-ahead (Anki default, 20 min) and state it explicitly in the plan.
- **Decision**: FIXED (Fix B). Paragraph in Implementation Approach, NOT-doing entry, manual check 3.5 extended, brief row updated.

### F2 — RLS check in 1.6 not executable as written

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Manual Verification 1.6
- **Detail**: The Supabase SQL editor runs as `postgres` and bypasses RLS, so the check always passes.
- **Fix**: Transaction with `set local role authenticated` + `request.jwt.claims`, then `rollback`.
- **Decision**: FIXED

### F3 — Ambiguous "Kontynuuj (N zostało)" condition

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — ReviewSession.tsx end screen
- **Detail**: `dueTotal - ratedInBatch` counts re-ratings of re-queued cards, so N is wrong. "Re-fetch decides" contradicts it.
- **Fix**: N = `dueTotal` − unique cards in batch; "Kontynuuj" always re-fetches; empty re-fetch → empty state.
- **Decision**: FIXED

### F4 — review_flashcard trusts caller values

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — migration, review_flashcard
- **Detail**: The RPC is callable directly via PostgREST, so a user can write arbitrary state and forged logs for their own cards, skewing `review_logs` metrics.
- **Fix**: Range checks (non-negative values, review within ±5 min of `now()`) plus an accepted-risk note.
- **Decision**: FIXED

### F5 — Queue route makes 3 Supabase round-trips

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — src/pages/api/reviews/queue.ts
- **Detail**: rpc + head count + min(due), plus middleware `getUser()`.
- **Fix**: `count(*) over () as due_total` in `get_review_queue`; `nextDueAt` query only when the queue is empty.
- **Decision**: FIXED

### F6 — Phase 1 build does not exercise ts-fsrs

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Success Criteria 1.3
- **Detail**: No route imports `srs.ts` in Phase 1, so the first workerd run of ts-fsrs happens in Phase 2, after `db push` to production.
- **Fix**: Explicit library gate in Phase 2 with a fallback path (the additive migration stays).
- **Decision**: FIXED

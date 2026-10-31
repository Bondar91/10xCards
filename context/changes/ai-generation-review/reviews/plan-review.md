<!-- PLAN-REVIEW-REPORT -->
# Plan Review: AI Flashcard Generation with Review

- **Plan**: context/changes/ai-generation-review/plan.md
- **Mode**: Deep
- **Date**: 2026-10-31
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 1 critical, 4 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | FAIL |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
6/6 paths ✓, 3/3 symbols ✓ (chatCompletion, AiErrorKind; health route has no other callers), brief↔plan ✓, Progress↔Phase ✓. Riskiest claims verified inline (eslint `strictTypeChecked`, `.dev.vars` → Supabase Cloud), no sub-agent.

## Findings

### F1 — Save would always fail on RLS, and the UPDATE policy lets users edit metrics

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — Migration (RLS + save_generation)
- **Detail**: The `generations` UPDATE policy `using (user_id = auth.uid() and saved_at is null)` has no WITH CHECK, so Postgres reuses USING as WITH CHECK; the RPC's UPDATE sets `saved_at` and always fails. The UPDATE/INSERT policies also let users change metric counts directly via PostgREST.
- **Fix A ⭐ Recommended**: SECURITY DEFINER `save_generation` with explicit `auth.uid()` filters; no UPDATE policy on `generations`.
  - Strength: Counts only change through the RPC, once.
  - Tradeoff: The function bypasses RLS — ownership checks must be written by hand.
  - Confidence: HIGH — standard Supabase pattern.
  - Blind spot: INSERT on `generations` stays open (a user can only skew their own metrics).
- **Fix B**: Keep SECURITY INVOKER, add `with check (user_id = auth.uid())`.
  - Strength: Minimal edit.
  - Tradeoff: Counts can still be edited directly.
  - Confidence: HIGH.
  - Blind spot: Metric integrity rests on users not tampering.
- **Decision**: FIXED (Fix A)

### F2 — Output-token budget too small for long inputs

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — flashcard-generator.ts
- **Detail**: 30 cards × (200 + 500 chars) can exceed `maxTokens` ~4,000 → JSON is cut off → `no_cards` on long texts after we've paid for the call; the 25 s timeout is tight; the 10k test only ran in Phase 4.
- **Fix**: Prompt cap of 20 cards with concise answers, `maxTokens` sized with headroom, recover complete cards from cut-off JSON, 10,000-char test in Phase 2.
  - Strength: The real long-text case gets checked before the UI and production phases.
  - Tradeoff: Recovery parsing is a bit more code; at most 20 cards.
  - Confidence: MED — real token speed and lengths not measured.
  - Blind spot: `ai-client` doesn't return finish_reason.
- **Decision**: FIXED

### F3 — strictTypeChecked + untyped Supabase client = `any` and lint errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 / Phase 2
- **Detail**: `createClient` has no Database type, so `.from()`/`.rpc()` results are `any` and `no-unsafe-*` fails the lint criteria.
- **Fix**: Generate `src/db/database.types.ts` and pass the `Database` type to `createServerClient`; add a success criterion.
- **Decision**: FIXED

### F4 — RPC → HTTP error mapping undefined (404/409)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 (RPC) ↔ Phase 2 (save route)
- **Detail**: "Distinct errors" without a contract for how the route tells them apart.
- **Fix**: SQLSTATE `GN404` / `GN409`; the route checks `error.code`.
- **Decision**: FIXED

### F5 — Single Supabase project: dev tests write to the production DB

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phases 1–3 manual, Phase 4 item 4.8
- **Detail**: `.dev.vars` points to Supabase Cloud; test data would be included in the acceptance ratio.
- **Fix**: Note dev = prod DB in Current State; clean up or exclude test accounts before the ratio query.
- **Decision**: FIXED

### F6 — input_length CHECK in characters vs JS .length in UTF-16 units

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 migration ↔ Phase 2 route
- **Detail**: Emoji-heavy text passes zod but fails a DB `between 1000 and 10000` check after the AI call → 500.
- **Fix**: DB `check (input_length > 0)`; bounds only in zod.
- **Decision**: FIXED

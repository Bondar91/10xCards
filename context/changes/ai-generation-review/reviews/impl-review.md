<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI Flashcard Generation with Review

- **Plan**: context/changes/ai-generation-review/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-10-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Automated criteria re-run 2026-10-31: `npm run build` ✅, eslint on all changed TS/TSX ✅, DB types contain generations/flashcards/save_generation ✅, `health.ts` gone ✅, prod anon `POST /api/generations` → 401 ✅. Plan drift agent: no MISSING/DRIFT; benign EXTRAs (generation_id index, defensive RPC guards, `api-response.ts`, `flashcard-limits.ts`, edit-implies-accept).

## Findings

### F1 — Direct PostgREST inserts can forge metrics and "AI" cards

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261031120000_flashcards_and_generations.sql:28-30, 57-59
- **Detail**: `generations_insert_own` and `flashcards_insert_own` check only `user_id`. Any authenticated user can POST to `/rest/v1/generations` with arbitrary `generated_count`, `accepted_*_count`, `saved_at` (an already-"saved" row with fake acceptance), and insert `flashcards` with `source='ai'` and any `generation_id` (FK check bypasses RLS, so even another user's id). This poisons the PRD 75 % acceptance metric. The plan itself specified "select / insert own", so this is a plan gap, not drift. No cross-user read/write of data is possible.
- **Fix**: New migration tightening the policies: generations insert `with check (user_id = auth.uid() and saved_at is null and accepted_unedited_count is null and accepted_edited_count is null)`; flashcards insert restricted to `source = 'manual' and generation_id is null` (the RPC is SECURITY DEFINER and does not need the policy; S-04 manual cards stay possible).
  - Strength: Closes metric forgery at the DB layer; no app code change; keeps S-04 path open.
  - Tradeoff: A second migration + type regen + `db push` to production.
  - Confidence: HIGH — RLS `with check` semantics are straightforward; the API never sets those columns.
  - Blind spot: `generated_count` itself remains client-forgeable via direct insert (it caps the RPC); fully closing that needs inserting generations through an RPC too.
- **Decision**: FIXED — migration 20261031180000_tighten_insert_policies.sql applied to Supabase Cloud (db push 2026-10-31)

### F2 — Open inline edit is lost when clicking "Zapisz"

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/generate/ProposalCard.tsx:39-61, src/components/generate/FlashcardGenerator.tsx:100-104
- **Detail**: Edit drafts live in ProposalCard local state. If a card is in edit mode when the user clicks "Zapisz (N)": a pending card is silently excluded; an accepted card saves its pre-edit text. Edit textareas/"Zapisz zmiany" also stay enabled during `saving`.
- **Fix**: Lift the "editing" flag into the hook (e.g. `editingIds`) and disable "Zapisz" / "Akceptuj pozostałe" while any card is being edited, with a hint "Zakończ edycję fiszki"; pass `disabled` to the edit controls too.
  - Strength: Small, explicit, no hidden auto-commit of possibly invalid drafts.
  - Tradeoff: One extra click for the user.
  - Confidence: HIGH — state is local, confirmed by reading the code.
  - Blind spot: None significant.
- **Decision**: FIXED — editing state lifted into useFlashcardGeneration (editingIds); "Zapisz" and "Akceptuj pozostałe" disabled while any card is in edit, with hint; edit controls disabled while saving

### F3 — Free-model availability and no per-user cap

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: wrangler.jsonc:22-35, src/lib/services/ai-client.ts:68-69, src/pages/api/generations/index.ts:40-67
- **Detail**: Production now uses `xingchen-agi/xing4.0-29b-a4b:free` (user decision, documented). Observed on prod: 5 consecutive 429s from the shared upstream pool; ~50 req/day at zero credits; single provider. No per-user rate limit (parked by plan), so one account can exhaust the daily quota for everyone. Correctness of `reasoning: { enabled: false }` now carries latency (27.7 s → 6 s) — a future model swap must keep it.
- **Fix A ⭐ Recommended**: Accept as documented risk for MVP/course; revisit before real users (top up ≥ $5 → back to Mistral; re-run 4.5).
  - Strength: Zero cost, privacy preserved, already recorded in change.md.
  - Tradeoff: Users will regularly see "Usługa AI chwilowo niedostępna".
  - Confidence: HIGH — behaviour measured on production.
  - Blind spot: Daily-cap exhaustion behaviour (429 vs other code) not observed.
- **Fix B**: Add a simple per-user daily cap (count today's `generations` rows before calling the AI).
  - Strength: Protects the shared quota from one user; cheap with existing table + index.
  - Tradeoff: Scope creep vs. plan ("rate limiting parked"); extra DB query + CPU on a route already at 13 ms.
  - Confidence: MED — cap value is a product decision.
  - Blind spot: Failed generations do not insert rows, so 429 retries would not be counted.
- **Decision**: ACCEPTED (Fix A) — free-model 429s, ~50 req/day cap and no per-user limit accepted as MVP risk; revisit before real users (top up credits → Mistral, re-run 4.5)

### F4 — Long-input production check and latency evidence missing

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 2.8, 4.5
- **Detail**: 2.8 ("10,000-char input … latency recorded") is ticked but no latency/salvage was recorded (change.md notes the gap). 4.5 is ticked with annotation: the 10k run was blocked by free-pool 429s; measurement is from a ~3k run. The 10k + `maxTokens=3000` behaviour (truncation → salvage) is unverified for the new model.
- **Fix**: Re-run one 10k-char generation (prod `wrangler tail`) when the pool is free or after moving to a paid model; record latency, `salvaged`, CPU in change.md Evidence.
- **Decision**: SKIPPED — retry 2026-10-31 again hit free-pool 429 (503, 15 ms CPU); re-run the 10k check later (after moving to a paid model)

### F5 — Supabase Site URL points to localhost (production signups broken)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: Supabase Dashboard → Authentication → URL Configuration (outside repo)
- **Detail**: Found during 4.6: confirmation emails link to `localhost:3000`, so new users cannot confirm accounts. S-01 plan required Site URL = production. Not caused by S-02, but it blocks every new user.
- **Fix**: Set Site URL `https://10xcards.krystian-bondaruk.workers.dev` and redirect `…/**` in the Dashboard; verify with one signup.
- **Decision**: ACCEPTED — deferred by user; fix Site URL + redirect URLs in Supabase Dashboard outside this change

### F6 — CPU above free-tier 10 ms on generation/save routes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: context/foundation/infrastructure.md (risk row "AI route exceeds 10ms CPU")
- **Detail**: Measured 13 ms (generate), 18 ms (save), 12 ms (404 save); all outcomes `ok`. Cloudflare currently tolerates it, but this is the documented risk materialising.
- **Fix**: Keep monitoring `outcome` in tail; Workers Paid is the documented fallback.
- **Decision**: ACCEPTED — documented in infrastructure.md risk register; watch tail outcome, Workers Paid is the fallback

### F7 — Undo/reject keeps edited text

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useFlashcardGeneration.ts (undo/reject → setStatus)
- **Detail**: After editing, "Cofnij decyzję" returns to pending but keeps the edited text and "Edytowana" badge; accepting later saves `ai-edited`. Plan's "undo a decision" is ambiguous.
- **Fix**: Decide intended behaviour; if undo should revert content, reset `front/back` to `original` in `undo`.
- **Decision**: FIXED — undo restores original front/back and pending status (useFlashcardGeneration)

### F8 — Unbounded request body parsed before zod

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/generations/index.ts:47, src/pages/api/generations/[id]/save.ts:33
- **Detail**: `request.json()` parses any size before `.max(10_000)`; a multi-MB authenticated body could burn CPU. Authenticated-only.
- **Fix**: Reject with 413 when `Content-Length` > ~64 KB before parsing.
- **Decision**: FIXED — bodyTooLarge() in api-response.ts; both routes return 413 when Content-Length > 64 KB before parsing

### F9 — `zod` vs `astro/zod` import inconsistency

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/generations/index.ts:2, src/pages/api/generations/[id]/save.ts:2, src/lib/services/flashcard-generator.ts:1
- **Detail**: Existing auth routes import `astro/zod`; new code imports `zod` (plan asked for the direct dependency). Single deduped copy (4.6.7), no runtime issue.
- **Fix**: Pick one convention and record it in CLAUDE.md (recommended: `zod` direct, migrate auth routes when touched).
- **Decision**: FIXED + ACCEPTED-AS-RULE: Import zod directly, not via astro/zod — auth routes (signin, signup, resend, confirm) migrated to `zod`

### F10 — Minor metric/edge-case nits

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/flashcard-generator.ts:105, src/components/hooks/useFlashcardGeneration.ts:159-162, migration:109-116
- **Detail**: `dropped` log counts cap-cut cards as dropped; on 409 `savedCount` shows this payload's size, not the stored count; model output with `\u0000`/lone surrogates would pass zod but fail Postgres (500 after paid AI call); whitespace-only `front` passes DB check for direct RPC callers.
- **Fix**: Optional polish — separate `capped` count in the log; strip `\u0000` in `ProposalSchema`; add `check (btrim(front) <> '')` in a future migration.
- **Decision**: SKIPPED

---
change_id: ai-generation-review
title: Ai generation review
status: implementing
created: 2026-10-31
updated: 2026-10-31
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **F-01 follow-up F4 closed (2026-10-31):** `POST /api/ai/health` deleted in Phase 2 (archived F-01 follow-up list is read-only, so closure is recorded here).
- **Phase 2 adaptation:** `save_generation` input errors (SQLSTATE `22023`: non-array / more cards than generated) map to 400 instead of the generic 500.
- **Phase 4 decision — free model (2026-10-31):** production generation returned 503 (OpenRouter 429): account has 0 credits and `mistral-small-3.2` has no `:free` variant. User chose not to pay. Switched `OPENROUTER_MODEL` to `xingchen-agi/xing4.0-29b-a4b:free` — the only free text model with a ZDR endpoint (Phala), so the PRD privacy NFR holds. It is a reasoning model (27.7 s for a ~400-char text), so `ai-client.ts` now sends `reasoning: { enabled: false }` (6 s, 0 reasoning tokens). Accepted risks: shared free upstream pool returns 429 under load ("AI unavailable" for users), ~50 req/day cap at zero credits, single provider. Revisit before real users (top up credits → back to Mistral).

## Evidence

- **Phase 1 — migration apply (2026-10-31):** `npx supabase link --project-ref idqndrompbqqdpnzsoon` + `npx supabase db push` (CLI v2.98.2, token auth) applied `20261031120000_flashcards_and_generations.sql` to Supabase Cloud. Types generated with `npx supabase gen types typescript --linked > src/db/database.types.ts`.
- **Phase 2 — wrangler dev checks (2026-10-31):** 2.4–2.8 confirmed by the user. 10k-char latency and salvage flag were not reported in-session — capture them in Phase 4 production measurement.
- **Phase 4 — production rollout (2026-10-31):** deployed via Git integration (versions `bc50b905` then the free-model redeploy from `8465d62`). Smoke: anon `POST /api/generations` → 401; anon `/generate` → 302 `/auth/signin?next=%2Fgenerate`; logged-in `POST /api/ai/health` → 404 (5 ms CPU).
- **Phase 4 — `wrangler tail` measurements:** `POST /api/generations` 200 (17 generated, 1 dropped, salvaged=false) = 13 ms CPU / 17.5 s wall (model 17.1 s); `POST …/save` 200 = 18 ms CPU / 178 ms wall; account B saving account A's generation → 404 (12 ms CPU); AI 429 error path = 3–24 ms CPU. All outcomes `ok` (no `exceededCpu`) despite >10 ms. Logs contained only `ai-client error` / `flashcard-generator` with kind/status/counts/latency — no input or card text.
- **4.5 annotation:** the 10,000-char production run could not complete — the free Xing4.0 shared pool returned 429 on 5 consecutive attempts (503 "AI unavailable" shown, text preserved). Measurement above is from the ~3k-char run. Re-run the 10k check after moving to a paid model.
- **4.6:** account B dashboard shows none of account A's cards; B's save on A's generation id → 404.
- **4.8/4.9:** acceptance ratio query run once on test data before cleanup: 1 generation, 17 generated, 8 accepted unedited, 0 edited → 47.1% (test only, not representative). Then all `flashcards` and `generations` rows deleted (0/0 left); accounts kept.
- **Finding (not S-02 scope):** Supabase Cloud Site URL resolves to `localhost:3000`, so signup confirmation links are broken on production. Fix in Dashboard → Authentication → URL Configuration (Site URL `https://10xcards.krystian-bondaruk.workers.dev`, redirect `…/**`). Test user B was created via Dashboard "Add user" with auto-confirm.

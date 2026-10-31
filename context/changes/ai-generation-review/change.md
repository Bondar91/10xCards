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

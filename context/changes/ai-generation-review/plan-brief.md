# AI Flashcard Generation with Review — Plan Brief

> Full plan: `context/changes/ai-generation-review/plan.md`

## What & Why

Roadmap S-02, the North Star: a signed-in user pastes text, the AI proposes flashcards, the user accepts / edits / rejects them and saves the accepted ones to their private deck. This is the product's core value and the direct measurement point of the primary success criterion ("75% of AI cards accepted"), so metrics are recorded from day one.

## Starting Point

F-01 delivered a ZDR-only OpenRouter gateway (`ai-client.ts`) with typed errors; S-01 delivered production auth with default-deny middleware. There are no app tables, no migrations, no `zod`, and the dashboard is a skeleton. `POST /api/ai/health` is a leftover smoke route flagged for removal (F-01 follow-up F4).

## Desired End State

`/generate` takes 1,000–10,000 chars, shows staged progress while the LLM works, then a review list with per-card accept/edit/reject and "Akceptuj pozostałe". "Zapisz" stores accepted cards atomically; the dashboard shows the card count. Every generation leaves a text-free metrics row; users never see each other's data.

## Key Decisions Made

| Decision        | Choice                                                                     | Why (1 sentence)                                                                 |
| --------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Metrics         | `generations` row per run + `flashcards.source` (`ai`/`ai-edited`/`manual`) | Makes both PRD primary criteria measurable; closes Roadmap Question #1          |
| Edited cards    | Separate `accepted_edited_count`                                           | Keeps both readings of "accepted" (60% vs 80%) without losing data              |
| Metrics timing  | Row written at generate, counts filled at save                              | Abandoned generations count as 0 accepted instead of vanishing from the ratio   |
| Accept all      | Accepts only pending cards ("Akceptuj pozostałe")                           | Never silently undoes an explicit reject or edit                                |
| Save model      | One batch save via `save_generation` RPC (security definer, explicit `auth.uid()` checks, once per generation; no UPDATE policy on `generations`) | Atomic, idempotent, one round trip; metrics can't be edited directly; proposals never persisted |
| Input size      | 1,000–10,000 chars, zod on server                                          | One LLM call stays well under 25 s and parsing stays cheap                       |
| Progress        | Staged indicator + skeletons, plain JSON response                          | Meets the guardrail without streaming complexity                                 |
| Deck            | One implicit deck per user                                                 | No deck-management FR in the PRD                                                 |
| AI failures     | No retry; Polish error by kind; text preserved; invalid cards dropped      | Predictable cost/latency, matches the F-01 contract                              |
| Abuse / F4      | Delete `/api/ai/health`; no rate limit                                     | Closes F4 cheaply; generation is auth-only and input-capped                      |
| Location        | New `/generate` page + dashboard CTA/count                                 | Dashboard stays the hub for S-03/S-05                                            |

## Scope

**In scope:** migration (2 tables, RLS, RPC), `src/types.ts`, `zod`, generation service + prompt, `POST /api/generations`, `POST /api/generations/:id/save`, `/generate` island, dashboard count + CTA, health-route removal, production CPU/privacy evidence.

**Out of scope:** streaming, chunking, retries, drafts, named decks, card edit/delete (S-03), manual cards (S-04), SRS (S-05), rate limiting, metrics UI, unit tests (Module 3).

## Architecture / Approach

`/generate` island → `POST /api/generations` (zod → `chatCompletion` JSON prompt → tolerant parse + salvage of cut-off output + per-card zod, cap 20 → insert `generations`) → `{generationId, cards}` → client-side review → `POST /api/generations/:id/save` → `save_generation` RPC (lock row, insert cards with `source`, set counts + `saved_at`) (security definer, explicit `auth.uid()` ownership checks).

## Phases at a Glance

| Phase                   | What it delivers                                      | Key risk                                                    |
| ----------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| 1. Data layer           | Migration, RLS, RPC, generated DB types, zod; applied to Cloud | First migration; CLI not linked yet                         |
| 2. API                  | Generation service, generate + save routes, F4 closed | Model output format drift → `no_cards`                      |
| 3. UI                   | `/generate` review island, dashboard CTA + count      | Edit/accept state edge cases                                |
| 4. Production rollout   | Deploy, isolation + privacy checks, CPU measurement   | Real-input CPU over the 10 ms free-tier limit               |

**Prerequisites:** F-01 and S-01 done (both archived); Supabase Cloud access to apply the migration; `wrangler` authenticated.
**Estimated effort:** ~2–3 sessions across 4 phases.

## Open Risks & Assumptions

- Mistral Small reliably returns the requested JSON shape without `response_format`; if not, `no_cards` rates will show it in Phase 2.
- CPU on the generation route may exceed 10 ms on free tier (SSR sign-in already measured 22 ms); Phase 4 stops for a decision rather than re-architecting.
- A refresh mid-review loses proposals (accepted trade-off for privacy and simplicity).

## Success Criteria (Summary)

- A user goes from pasted text to saved cards on production with visible progress and Polish UI throughout.
- `generations` gives an acceptance ratio (unedited and edited separately) with no stored text.
- A second account never sees the first account's cards or generations.

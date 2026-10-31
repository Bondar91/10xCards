# SRS Review Session — Plan Brief

> Full plan: `context/changes/srs-review-session/plan.md`
> Research: `context/changes/srs-review-session/research.md`

## What & Why

Roadmap S-05 (US-02, FR-007): a user starts a review session, sees due flashcards in the order set by FSRS (`ts-fsrs@5.4.2`), rates each one, and the next review date is updated. Spaced repetition closes the learning loop and is what makes users come back the next day.

## Starting Point

Flashcards exist (S-02) but carry no SRS state, and the table has no UPDATE path (S-03 owns content editing). The library is verified as pure ESM, but it has not yet been run inside workerd. The route, RPC, hook and page patterns from S-02 are ready to reuse.

## Desired End State

`/review` shows a card's front, then its answer, then four rating buttons, each with the resulting interval label. Poorly-rated cards come back in the same session. Each session takes up to 20 due cards and offers "Kontynuuj" when more remain. The dashboard shows "Do powtórki: N". Every rating is logged to `review_logs`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| SRS library | `ts-fsrs@^5.4.2` (not 6.x) | ESM with zero imports, no Node ≥ 24 requirement. | Research |
| State storage | Columns on `flashcards` with `createEmptyCard` defaults | Free backfill to New, single-table queue with a `(user_id, due)` index. | Plan |
| Write path | Narrow `SECURITY DEFINER` RPC (SRS columns only) | No general UPDATE policy, so no collision with S-03. | Research / Plan |
| Review history | `review_logs`, written in the same RPC | Data for the return-next-day metric and later weight tuning; history can't be backfilled. | Plan |
| Short-term steps | On; cards due within 20 min are re-queued in-session and may be shown early (learn-ahead, as in Anki) | Forgotten cards are drilled immediately; no waiting screen. | Plan / Review F1 |
| Session size | Batch of 20 + "Kontynuuj", no daily new-card limit | Short sessions without time-zone logic. | Plan |
| Tie order | `order by due, random()` in SQL | Cards from one generation share `due`; shuffling avoids learning the order, and SQL keeps the limit cutoff fair. | Plan |
| Double rating | Optimistic check on `reps` → 409, client skips | No double-counted lapses or duplicate logs. | Plan |
| Scheduling location | Server only; interval labels and requeue flag in responses | zod at the boundary; no client clock math or bundled library. | Research |
| Validation | zod rating 1–4 (no `FSRSValidationError` import) | The class isn't exported in v5.4.2. | Research |
| Tests | vitest (first in repo) for `srs.ts` | Locks date round-trips and interval rules that would otherwise fail days later. | Plan |
| Fuzz | `enable_fuzz: true` | Spreads same-batch cards across days; deterministic for a fixed `now`. | Plan |

## Scope

**In scope:** migration (SRS columns, index, `review_logs`, `get_review_queue`, `review_flashcard`); `srs.ts` service + vitest; `GET /api/reviews/queue`, `POST /api/reviews`; `/review` page with keyboard shortcuts; dashboard due count + CTA; production evidence.

**Out of scope:** daily new-card limits / time zones; undo, forget, statistics, retrievability display; FSRS optimisation; flashcard edit/delete (S-03); CI workflow; client-side ts-fsrs.

## Architecture / Approach

Client → `GET /api/reviews/queue` → `get_review_queue(20)` (`SECURITY INVOKER`, RLS) → rows mapped to DTOs with server-computed interval labels. Client → `POST /api/reviews {flashcardId, rating, expectedReps}` → route reads the row (RLS) → `scheduler.next()` → `review_flashcard` RPC (`for update`, `reps` check, updates SRS columns + inserts log atomically) → `{reps, intervals, requeue}`. The hook appends re-queued cards to the end of the local queue.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data layer & SRS core | Migration on Cloud, typed client, `srs.ts` + unit tests | Migration runs on the production DB (dev = prod) |
| 2. Review API | Queue + rating routes; ts-fsrs running in workerd | First runtime execution of the library in Workers |
| 3. Session UI & dashboard | `/review` flow, requeue, end/empty states, dashboard CTA | Stale `reps` on re-queued cards → spurious 409 |
| 4. Production rollout | Isolation, CPU numbers, scheduling verified live | Interval correctness only visible after time passes |

**Prerequisites:** S-02 merged (done); Supabase CLI linked (`npx supabase link`); test accounts for dev = prod.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- ts-fsrs has not yet run in workerd; Phase 2 is the gate (fallback: investigate the bundling, since the package has no imports).
- S-03 must not overwrite SRS columns when it adds content editing; this is noted for its plan.
- All existing cards become due at once after migration; batches of 20 absorb this.

## Success Criteria (Summary)

- A user can finish a session; each rating changes the card's next due date, and forgotten cards come back in the same session.
- Users see only their own cards, and double ratings are not counted.
- `npm test` covers the scheduling service; production CPU per request stays within the Workers limit.

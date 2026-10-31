# SRS Review Session — Implementation Plan

## Overview

Roadmap slice S-05 (US-02, FR-007). A signed-in user starts a review session on `/review`, sees their due flashcards in the order set by the FSRS algorithm (`ts-fsrs@5.4.2`), reveals the answer, rates it (Again / Hard / Good / Easy), and the next review date is recomputed and saved. Cards rated poorly come back in the same session; the dashboard shows how many cards are due. Every rating is also logged to `review_logs` so the "user returns the next day" criterion and future FSRS weight optimisation have data from day one.

## Current State Analysis

- **No SRS state anywhere.** `flashcards` holds content + metadata only (`supabase/migrations/20261031120000_flashcards_and_generations.sql:37-46`), indexes on `(user_id)` and `(generation_id)` only (`:48-49`).
- **No UPDATE policy on `flashcards`** (`:61` — "UPDATE / DELETE policies arrive with S-03"). S-03 runs in parallel and will add content editing; S-05 must not open a general UPDATE path.
- **Cards are inserted with explicit column lists** — `save_generation()` (`:105-112`) and the manual-insert policy (`20261031180000_tighten_insert_policies.sql:18-24`) — so new columns with defaults are filled automatically for AI and future manual (S-04) cards.
- **Library verified statically** (research §1): `ts-fsrs@5.4.2` is pure ESM, zero imports, `engines.node >= 20`. `FSRSValidationError` is **not exported**; `elapsed_days` is `@deprecated` but still part of the v5 `Card` type; `get_retrievability` returns a string by default. Runtime execution in workerd was **not** verified yet.
- **Patterns to reuse**: API route shape with zod + `jsonError` + RPC error-code mapping (`src/pages/api/generations/[id]/save.ts:9-84`); `SECURITY DEFINER` RPC with `set search_path = ''`, explicit `auth.uid()` filters and custom errcodes (`20261031120000…sql:67-129`); Astro page + `client:load` React island (`src/pages/generate.astro`); hook with `postJson<T>` + Polish `STATUS_MESSAGES` (`src/components/hooks/useFlashcardGeneration.ts`); dashboard head-count query (`src/pages/dashboard.astro:7-13`).
- **Middleware is default-deny** (`src/middleware.ts:4-6, 44-60`) — `/review` and `/api/reviews/*` are protected with no changes.
- **Dev = production DB**: `.dev.vars` points to Supabase Cloud; every `wrangler dev` test writes production rows. Use dedicated test accounts.
- **No test framework, no CI workflow** (`.github/workflows/` absent). `npm run lint` has pre-existing `.astro` parse errors — lint changed TS/TSX files with `npx eslint <files>`.

## Desired End State

- `/review` (protected): shows the front of the first due card, "Pokaż odpowiedź" reveals the back, then four rating buttons each labelled with the resulting interval ("<1 min", "10 min", "3 dni"…). Rating moves to the next card. Cards whose new due date falls within 20 minutes are appended to the end of the current queue and shown again. The session ends when the queue is empty; the end screen shows the number of ratings and, if more cards are due, "Kontynuuj (N zostało)". When nothing is due, an empty state shows the next due date.
- A session fetches at most 20 cards with `due <= now()`, ordered by `due` ascending, ties shuffled randomly **in SQL** (so a cutoff through equal `due` values does not always pick the same cards).
- Rating the same card twice from a stale view (double click, retry, two tabs) is rejected with 409 and not counted; the client silently moves on.
- `/dashboard` shows "Do powtórki: N" and a "Rozpocznij powtórki" link.
- Database: SRS columns on `flashcards` (all existing cards become `New`, `due = migration time`), `review_logs` table (select-own RLS, writes only via RPC), `get_review_queue` and `review_flashcard` functions.
- `src/lib/services/srs.ts` is covered by vitest unit tests (`npm test`).
- Verified on production: two-account isolation, `cpuTime` for `POST /api/reviews` recorded, a "Good" card disappears from the queue until its scheduled date.

### Key Discoveries:

- `20261031120000_flashcards_and_generations.sql:105-112` — `save_generation` lists columns explicitly → SRS defaults apply without touching the RPC.
- `20261031120000_flashcards_and_generations.sql:67-129` — RPC template (errcodes, `for update`, `revoke … from public, anon`).
- `src/pages/api/generations/[id]/save.ts:57-81` — error-code → HTTP mapping to mirror.
- `ts-fsrs@5.4.2 dist/index.d.ts:43-62, 394-400` — `Card`/`CardInput` field names equal the proposed column names, so `TypeConvert.card(row)` takes the DB row directly (ISO strings accepted as `DateInput`).
- `context/foundation/lessons.md` — import `zod`, not `astro/zod`.

## What We're NOT Doing

- No daily new-card limit and no user time-zone handling (session = batch of 20 + "Kontynuuj").
- No FSRS parameter optimisation, per-user parameters, `forget`/`rollback`/"undo last rating".
- No retrievability display or statistics page (logs are stored, not visualised).
- No UPDATE/DELETE policy on `flashcards` — content editing and deletion stay with S-03. `review_logs.flashcard_id` cascades on delete so S-03 needs nothing extra.
- No position column / generation order for ties — ties are shuffled on purpose.
- No offline/optimistic rating — the next card appears after the server confirms.
- No waiting for a re-queued card's `due` ("next card in X min" screen) — learn-ahead shows it early (see Implementation Approach).
- No CI workflow (vitest runs locally via `npm test`).
- No `ts-fsrs` in the browser bundle — all scheduling and interval labels are computed server-side.

## Implementation Approach

Server-authoritative scheduling. The client never sends card state; it sends `{ flashcardId, rating, expectedReps }`. The route loads the card through RLS, runs `scheduler.next(...)` with server `now`, and hands the resulting state + log to a narrow `SECURITY DEFINER` RPC that updates only SRS columns and inserts the log atomically, guarded by `reps = expectedReps` (reps grows by 1 on every rating, so it is a sufficient version token). The queue comes from a `SECURITY INVOKER` SQL function (RLS still applies) because PostgREST cannot `order by random()`. Interval labels and the "show again in this session" decision are computed on the server, so client clock skew does not matter and the client needs no date math.

**Learn-ahead (deliberate):** a re-queued card is shown when it reaches the front of the local queue, even if its `due` is still in the future (up to the 20-minute window). This matches Anki's default "learn ahead limit" of 20 min. Consequence: when the re-queued card is the last one left, it reappears immediately although its label said "1 min"/"10 min", and two "Dobrze" in a row can take a New card through both learning steps in seconds. Accepted for MVP (plan-review F1).

Scheduler config: `fsrs({ enable_fuzz: true, enable_short_term: true })`, other parameters default (`request_retention 0.9`, `learning_steps ['1m','10m']`, `relearning_steps ['10m']`). Fuzz spreads cards saved in one batch so they do not all come back on the same day; in ts-fsrs v5 fuzz is seeded from the card + review time, so it is deterministic for a fixed `now` in tests.

## Critical Implementation Details

**Timing & lifecycle** — The route must compute `next()` from the row it just read, and the RPC must re-check `reps` under `for update`; reading and writing without that check lets two concurrent requests both compute from the same old state. Distinguish "card not found / not yours" (`RV404`) from "state changed" (`RV409`) inside the RPC by first selecting the row by id + `auth.uid()`, then comparing `reps`.

**State sequencing** — A re-queued card is rated again with the `reps` returned by the previous rating response, not the value from the original queue payload; the hook must replace the card's `reps` and `intervals` when it re-queues it, or the second rating will 409.

## Phase 1: Data layer & SRS core

### Overview

Schema, RPCs and the pure scheduling service with unit tests. Nothing user-visible yet.

### Changes Required:

#### 1. Dependencies & test runner

**File**: `package.json`, `vitest.config.ts` (new)

**Intent**: Add `ts-fsrs` pinned to the 5.x line chosen in `srs-library-research.md` and introduce vitest as the project's first test runner, scoped to pure TS modules.

**Contract**: `dependencies["ts-fsrs"] = "^5.4.2"` (must not resolve to 6.x); `devDependencies.vitest`; script `"test": "vitest run"`. `vitest.config.ts` is a plain vitest config (not `getViteConfig`, to avoid booting the Cloudflare adapter) with `resolve.alias` `@` → `./src` and `include: ["src/**/*.test.ts"]`.

#### 2. Migration

**File**: `supabase/migrations/20261031210000_srs_review_state.sql`

**Intent**: Add FSRS state to `flashcards` with defaults equal to `createEmptyCard()` (backfills existing rows as `New`), create the append-only `review_logs` table, and the two functions the API uses.

**Contract**:
- `flashcards` new columns: `due timestamptz not null default now()`, `stability double precision not null default 0`, `difficulty double precision not null default 0`, `elapsed_days int not null default 0`, `scheduled_days int not null default 0`, `learning_steps int not null default 0`, `reps int not null default 0`, `lapses int not null default 0`, `state smallint not null default 0 check (state between 0 and 3)`, `last_review timestamptz null`. Index `flashcards_user_id_due_idx on (user_id, due)`.
- `review_logs`: `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users on delete cascade`, `flashcard_id uuid not null references flashcards on delete cascade`, `rating smallint not null check (rating between 1 and 4)`, `state smallint not null check (state between 0 and 3)` (state **before** the rating, as returned by ts-fsrs `ReviewLog`), `due timestamptz not null`, `stability double precision not null`, `difficulty double precision not null`, `scheduled_days int not null`, `learning_steps int not null`, `review timestamptz not null`. Deprecated `elapsed_days`/`last_elapsed_days` are not stored. Index on `(user_id, review)` and `(flashcard_id)`. RLS enabled; policy `review_logs_select_own` (select, authenticated); **no** insert/update/delete policies.
- `get_review_queue(p_limit int) returns table (id, front, back, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, due_total bigint)` — `language sql stable security invoker`, `set search_path = ''`, filters `due <= now()`, `order by due, random()`, `limit least(greatest(p_limit, 1), 50)`. `due_total` = `count(*) over ()` (window functions are evaluated before LIMIT, so it is the full number of due cards, not the batch size). RLS restricts rows to the caller.
- `review_flashcard(p_flashcard_id uuid, p_expected_reps int, p_due timestamptz, p_stability float8, p_difficulty float8, p_elapsed_days int, p_scheduled_days int, p_learning_steps int, p_reps int, p_lapses int, p_state smallint, p_last_review timestamptz, p_log jsonb) returns void` — `plpgsql security definer set search_path = ''`. Null `auth.uid()` or no row for id + uid (`for update`) → errcode `RV404`; `reps <> p_expected_reps` → `RV409`; `p_reps <> p_expected_reps + 1` or invalid `p_log` rating/state → `22023`. Also `22023` when values are out of range: `p_stability`/`p_difficulty` < 0, any counter < 0, `p_state` not 0–3, or `p_log ->> 'review'` more than 5 minutes away from `now()`. Updates **only** the SRS columns (never `front`/`back`/`updated_at`), inserts one `review_logs` row with `user_id = auth.uid()`. `revoke execute … from public, anon; grant … to authenticated` for both functions.
- Accepted risk (plan-review F4): `review_flashcard` is callable directly via PostgREST, bypassing the route and ts-fsrs. A user can then only write plausible-range state and logs for **their own** cards; the range checks above stop absurd values from skewing `review_logs`-based metrics.

#### 3. Apply migration & regenerate types

**File**: `src/db/database.types.ts`

**Intent**: Apply to Supabase Cloud and refresh generated types so the typed client knows the new columns and RPCs.

**Contract**: `npx supabase db push`, then `npx supabase gen types typescript --linked > src/db/database.types.ts`. Record in `change.md` that existing cards received `state = 0`.

#### 4. SRS service

**File**: `src/lib/services/srs.ts`

**Intent**: Single place for the scheduler instance and all FSRS ↔ DB ↔ DTO conversions, kept free of Supabase/Astro imports so it is unit-testable.

**Contract**:
- `scheduler` = `fsrs({ enable_fuzz: true, enable_short_term: true })`.
- `REVIEW_SESSION_LIMIT = 20`, `REQUEUE_WINDOW_MS = 20 * 60 * 1000`.
- `RatingSchema` — zod, integer 1–4 (`Rating.Manual` = 0 rejected).
- `rowToCard(row): Card` — via `TypeConvert.card`.
- `rateCard(row, rating, now) → { card: Card; log: ReviewLog }` — wraps `scheduler.next`.
- `cardToRpcArgs(card)` / `logToJson(log)` — produce the RPC parameter object (ISO strings for dates, `last_review` never undefined → null).
- `intervalLabels(row, now) → Record<1|2|3|4, string>` — from `scheduler.repeat`, formatted by `formatInterval(ms)` in Polish: `<1 min`, `N min`, `N godz.`, `N dni`, `N mies.`, `N lat` (thresholds documented in the function).
- `shouldRequeue(card, now) → boolean` — `card.due - now <= REQUEUE_WINDOW_MS`.

#### 5. Unit tests

**File**: `src/lib/services/srs.test.ts`

**Intent**: Lock the subtle parts: date round-trips, rating validation, interval labels and the requeue rule.

**Contract**: Cases listed in "Testing Strategy → Unit Tests".

### Success Criteria:

#### Automated Verification:

- `npm install` resolves `ts-fsrs` to 5.x (`npm ls ts-fsrs`) and `vitest`
- `npm test` passes
- `npm run build` passes
- `npx eslint src/lib/services/srs.ts src/lib/services/srs.test.ts vitest.config.ts` passes

#### Manual Verification:

- `npx supabase db push` applied the migration; in the SQL editor existing `flashcards` rows have `state = 0`, `reps = 0`, `due` set
- RLS check in the SQL editor (which runs as `postgres` and bypasses RLS unless the role is switched): in a transaction `begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<test-user-uuid>","role":"authenticated"}';` → `select * from public.get_review_queue(20)` returns only that user's cards, `select * from public.review_logs` only their rows, `insert into public.review_logs …` is denied → `rollback;`
- `src/db/database.types.ts` contains the new columns and both functions

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Review API

### Overview

Two protected routes that serve the queue and accept ratings; first execution of `ts-fsrs` inside workerd.

**Library gate** (plan-review F6): Phase 1's `npm run build` does not bundle `ts-fsrs`, because no route imports `srs.ts` yet, so this phase is the first real runtime check. If `ts-fsrs` fails under `wrangler dev`, stop. The Phase 1 migration stays, since it is additive and unused. Go back to library selection (`srs-library-research.md`) before continuing.

### Changes Required:

#### 1. DTOs

**File**: `src/types.ts`

**Intent**: Shared request/response types for the routes and the hook.

**Contract**: `ReviewRating = 1 | 2 | 3 | 4`; `ReviewCardDto { id; front; back; reps; intervals: Record<ReviewRating, string> }`; `ReviewQueueResponse { cards: ReviewCardDto[]; dueTotal: number; nextDueAt: string | null }`; `SubmitReviewRequest { flashcardId; rating; expectedReps }`; `SubmitReviewResponse { reps; intervals; requeue: boolean }`.

#### 2. Queue route

**File**: `src/pages/api/reviews/queue.ts`

**Intent**: Return the next batch of due cards with interval labels, plus counts for the end/empty screens.

**Contract**: `GET`, `prerender = false`, 401 without user, 503 when `createClient` returns null. Calls `rpc("get_review_queue", { p_limit: REVIEW_SESSION_LIMIT })`; `dueTotal` = `due_total` from the first row (0 when empty). Only when the queue is empty, one extra query: `nextDueAt` = min `due` of own cards with `due > now` (null if none). Common case = one Supabase round-trip. Maps rows to `ReviewCardDto` with `intervalLabels(row, now)` using one `now` for the whole response. DB error → 500 with `console.error` of the code only.

#### 3. Rating route

**File**: `src/pages/api/reviews/index.ts`

**Intent**: Validate, schedule, persist; mirror the error mapping of `save.ts`.

**Contract**: `POST`, body zod `{ flashcardId: z.uuid(), rating: RatingSchema, expectedReps: z.int().min(0) }`, `bodyTooLarge` + JSON try/catch as in `save.ts`. Loads the card's SRS columns via `from("flashcards").select(...).eq("id", …).maybeSingle()` (RLS) → missing → 404. If `row.reps !== expectedReps` → 409 without calling the RPC. `rateCard(row, rating, now)` → `rpc("review_flashcard", …)`. Mapping: `RV404` → 404 `not_found`, `RV409` → 409 `stale_review`, `22023` → 400 `validation`, other → 500. An unexpected throw from ts-fsrs → 500 (no `FSRSValidationError` import). Success → `SubmitReviewResponse` with `intervals` computed from the **new** card and `requeue = shouldRequeue(card, now)`.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes
- `npm test` passes
- `npx eslint src/pages/api/reviews src/types.ts` passes

#### Manual Verification:

- `wrangler dev`: anonymous `GET /api/reviews/queue` and `POST /api/reviews` → 401
- `wrangler dev`: queue returns ≤ 20 own cards with four interval labels; `ts-fsrs` runs in workerd with no runtime error
- `wrangler dev`: rating `1` (Again) on a New card returns `requeue: true`; rating `3` on a review card returns `requeue: false` and the card leaves the queue; a `review_logs` row is written
- `wrangler dev`: repeating the same POST with the old `expectedReps` → 409 and no second log row
- `wrangler dev`: `rating: 0`, `rating: 5`, non-uuid id → 400; another user's card id → 404

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Review session UI & dashboard

### Overview

The `/review` page with the session flow, and the dashboard entry point.

### Changes Required:

#### 1. Session hook

**File**: `src/components/hooks/useReviewSession.ts`

**Intent**: Own the session state machine and API calls, following `useFlashcardGeneration.ts` (`postJson`-style helper, Polish status messages).

**Contract**: Steps `loading | question | answer | submitting | finished | empty | error`. Holds `queue`, `ratedCount`, `dueTotal`, `nextDueAt`. `reveal()`, `rate(rating)`, `continueSession()` (re-fetch queue). On success: if `requeue`, append the card with updated `reps`/`intervals` to the end of the queue; advance. On 409: drop the card and advance without an error. On other errors: keep the card on screen with the message and allow retry. 409 message map entry is not shown to the user.

#### 2. Session component

**File**: `src/components/review/ReviewSession.tsx` (+ small `RatingButtons.tsx` if it keeps the main file readable)

**Intent**: Render front → "Pokaż odpowiedź" → back + four buttons (Nie pamiętam / Trudne / Dobrze / Łatwe) each with its interval label; progress "Ocenione: X · W kolejce: Y"; end screen shows "Kontynuuj (N zostało)" with N = `dueTotal` from the batch's queue response − number of **unique** cards in that batch (re-ratings of re-queued cards do not count), only when N > 0, otherwise a link to the dashboard. "Kontynuuj" always re-fetches the queue; if the re-fetch is empty, it shows the empty state; empty state with formatted `nextDueAt` (or "Brak fiszek — wygeneruj pierwsze" with link to `/generate` when null).

**Contract**: Keyboard: Space/Enter reveals, `1`–`4` rate when the answer is shown. Buttons disabled and visibly pending during `submitting` (≤ 200 ms acknowledgement NFR). Class constants + `cn()` as in `FlashcardGenerator.tsx:12-15`. Polish copy.

#### 3. Page

**File**: `src/pages/review.astro`

**Intent**: Same shell as `generate.astro` (`bg-cosmic` glass card, "← Panel" link) mounting `<ReviewSession client:load />`.

**Contract**: Title "Powtórki".

#### 4. Dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Show how many cards are due and link to the session.

**Contract**: Second head count with `.lte("due", new Date().toISOString())`, same failure handling as the existing count (render without the number). Link "Rozpocznij powtórki" to `/review`, shown when the user has any flashcards.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes
- `npm test` passes
- `npx eslint src/components/hooks/useReviewSession.ts src/components/review` passes

#### Manual Verification:

- `wrangler dev`: dashboard shows "Do powtórki: N"; link opens `/review`
- Full flow: front → reveal → rate → next card; "Nie pamiętam" card reappears later in the same session; when it is the last card it reappears immediately (learn-ahead); session ends with the end screen
- With > 20 due cards, "Kontynuuj" loads the next batch; a refresh of the page shows ties in a different order
- Double-clicking a rating button records one review (one `review_logs` row)
- Keyboard shortcuts work; layout works in Chrome, Firefox, Safari
- Empty state shows the next due date when nothing is due

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Production rollout & evidence

### Overview

Merge to `main` (auto-deploy via Cloudflare Git integration), verify on production, record evidence.

### Changes Required:

#### 1. Evidence

**File**: `context/changes/srs-review-session/change.md`, `context/foundation/infrastructure.md`

**Intent**: Record production verification and close the "SRS library ships CJS-only" risk.

**Contract**: `change.md` Evidence section (migration applied, isolation check, CPU numbers); `infrastructure.md:80` risk marked mitigated with the measured `cpuTime` of `GET /api/reviews/queue` and `POST /api/reviews`.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes on merged `main`
- `npm test` passes on merged `main`

#### Manual Verification:

- Production: two accounts — each sees only its own queue; posting a rating for the other account's card id → 404
- `wrangler tail`: `cpuTime` for both review routes recorded, within the Workers limit
- Production: a card rated "Dobrze" is absent from the queue and the dashboard due count drops; next day (or by `due` in SQL) it is scheduled at the labelled interval
- No regressions: `/generate` save still works and new cards appear in the queue as New

**Implementation Note**: After completing this phase, confirm with the human before closing out the change.

---

## Testing Strategy

### Unit Tests (`src/lib/services/srs.test.ts`):

- `rowToCard` accepts a row with ISO strings and `last_review: null` → `Card` with `Date` fields, `state = New`
- `rateCard` for each rating 1–4 on a New card: `reps` becomes 1, log `rating` matches, log `state` = state before (0)
- Round-trip: `rateCard` → `cardToRpcArgs` → back through `rowToCard` yields the same `due`/`stability`/`difficulty`
- `RatingSchema` rejects 0, 5, 2.5, `"3"`; accepts 1–4
- `formatInterval` boundaries: 30 s → `<1 min`, 10 min, 59 min, 1 h, 23 h, 1 day, 30 days, 365 days
- `shouldRequeue`: Again on New card → true; Good on a review-state card with stability > 1 → false; exactly 20 min → true, 20 min + 1 ms → false
- `intervalLabels` returns four non-empty labels, Again ≤ Hard ≤ Good ≤ Easy by underlying due

### Integration Tests:

- None automated (no DB test harness). Covered by Phase 2 manual checks against `wrangler dev`.

### Manual Testing Steps:

1. Fresh test account → generate and save 5 cards → dashboard shows "Do powtórki: 5".
2. Start session, rate the first card "Nie pamiętam" and the rest "Dobrze" → the first card returns at the end; end screen appears.
3. Reload `/review` → empty state with next due date.
4. Double-click a rating → one row in `review_logs`.
5. Second account → cannot see or rate the first account's cards.

## Performance Considerations

FSRS math is a few floating-point operations per card; the queue route computes `repeat()` for at most 20 cards. Cost is dominated by middleware `getUser()` and two Supabase round-trips per request, as with S-02 routes (13–18 ms CPU measured). The `(user_id, due)` index keeps the queue and due-count queries index-only as decks grow.

## Migration Notes

- `alter table … add column … default` backfills existing cards as New with `due` = migration time — all immediately due. Ties among them are shuffled by `get_review_queue`.
- Rollback: drop both functions, `review_logs`, the index, then the SRS columns. No other code depends on them before this change.
- S-03 coordination: when S-03 adds an UPDATE policy/path on `flashcards`, it must not overwrite SRS columns (note in S-03 plan); `review_logs` cascades on card delete.
- Moving to `ts-fsrs` v6 later: drop `elapsed_days` in a follow-up migration.

## References

- Research: `context/changes/srs-review-session/research.md`
- Library choice: `context/changes/srs-review-session/srs-library-research.md`
- Library docs (with corrections in research): `context/changes/srs-review-session/ts-fsrs-docs.md`
- RPC pattern: `supabase/migrations/20261031120000_flashcards_and_generations.sql:67-129`
- Route pattern: `src/pages/api/generations/[id]/save.ts:9-84`
- Hook pattern: `src/components/hooks/useFlashcardGeneration.ts`
- Prior plan (structure, prod-evidence phase): `context/changes/ai-generation-review/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer & SRS core

#### Automated

- [x] 1.1 `npm install` resolves `ts-fsrs` to 5.x and `vitest` — 6db57d8
- [x] 1.2 `npm test` passes — 6db57d8
- [x] 1.3 `npm run build` passes — 6db57d8
- [x] 1.4 eslint on SRS service, tests and vitest config passes — 6db57d8

#### Manual

- [x] 1.5 Migration applied; existing flashcards have `state = 0`, `reps = 0`, `due` set — 6db57d8
- [x] 1.6 RLS check under `set local role authenticated`: queue and logs return own rows only; direct insert denied — 6db57d8
- [x] 1.7 `database.types.ts` contains new columns and both functions — 6db57d8

### Phase 2: Review API

#### Automated

- [x] 2.1 `npm run build` passes — c61e152
- [x] 2.2 `npm test` passes — c61e152
- [x] 2.3 eslint on review routes and types passes — c61e152

#### Manual

- [x] 2.4 wrangler dev: anonymous queue and rating requests return 401 — c61e152
- [x] 2.5 wrangler dev: queue returns ≤ 20 own cards with interval labels; ts-fsrs runs in workerd — c61e152
- [x] 2.6 wrangler dev: Again → requeue true; Good on review card → requeue false; log row written — c61e152
- [x] 2.7 wrangler dev: stale expectedReps → 409, no second log row — c61e152
- [x] 2.8 wrangler dev: invalid rating / id → 400; foreign card → 404 — c61e152

### Phase 3: Review session UI & dashboard

#### Automated

- [x] 3.1 `npm run build` passes — f5210f1
- [x] 3.2 `npm test` passes — f5210f1
- [x] 3.3 eslint on hook and review components passes — f5210f1

#### Manual

- [x] 3.4 Dashboard shows due count and links to `/review` — f5210f1
- [x] 3.5 Full flow works; "Nie pamiętam" card reappears in the same session (immediately when last); end screen shown — f5210f1
- [x] 3.6 "Kontynuuj" loads next batch; ties reshuffle on refresh — f5210f1
- [x] 3.7 Double-click records one review — f5210f1
- [x] 3.8 Keyboard shortcuts and cross-browser layout work — f5210f1
- [x] 3.9 Empty state shows next due date — f5210f1

### Phase 4: Production rollout & evidence

#### Automated

- [x] 4.1 `npm run build` passes on merged `main` — 7923f07
- [x] 4.2 `npm test` passes on merged `main` — 7923f07

#### Manual

- [x] 4.3 Production two-account isolation verified — 7923f07
- [x] 4.4 `cpuTime` for review routes recorded within limit — 7923f07
- [x] 4.5 "Dobrze" card leaves the queue; due count drops; scheduled at labelled interval — 7923f07
- [x] 4.6 No regressions in `/generate` save; new cards appear as New — 7923f07

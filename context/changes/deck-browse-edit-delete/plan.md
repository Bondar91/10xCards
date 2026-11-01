# Deck Browse, Edit & Delete (S-03) Implementation Plan

## Overview

Give the signed-in user a `/flashcards` page ("Moje fiszki") where they can page through their saved flashcards (newest first, 50 per page), fix the content of any card in place, and delete cards they no longer need. Delivers roadmap slice S-03 / PRD FR-006: without editing, AI errors stay in the deck permanently.

## Current State Analysis

- `public.flashcards` has SELECT and INSERT policies only. UPDATE/DELETE were explicitly deferred to S-03 (`supabase/migrations/20261031120000_flashcards_and_generations.sql:61`, `20261031210000_srs_review_state.sql:23`).
- Every write that touches protected columns goes through a `SECURITY DEFINER` RPC that filters by `auth.uid()` and raises custom errcodes: `save_generation` (`GN404`/`GN409`), `review_flashcard` (`RV404`/`RV409`). The INSERT policy was tightened so direct inserts can only create `source = 'manual'` cards (`20261031180000_tighten_insert_policies.sql`).
- RLS cannot restrict columns. A plain `UPDATE using (user_id = auth.uid())` policy would let any user rewrite `due`, `reps`, `stability` or `source` via PostgREST and bypass the S-02 metrics and S-05 scheduling guards.
- `save_generation` inserts up to 20 rows in one transaction, so a whole batch shares one `created_at` value. Ordering by `created_at` alone is unstable.
- `flashcards_user_id_idx` was dropped in S-05 (`20261031220000_harden_review_flashcard.sql:9`). The only per-user index is `(user_id, due)`, which does not serve a `created_at` ordering.
- `review_logs.flashcard_id` is `on delete cascade`, so deleting a card removes its history. `generations` counts are untouched by card deletes, so the S-02 acceptance metric is preserved.
- There is no list page. `dashboard.astro` shows counts plus links to `/review` and `/generate`. The middleware is default-deny, so any new page is protected automatically (`src/middleware.ts:4-6`).
- Reusable patterns:
  - `ProposalSchema` (zod: trim, 1–200 / 1–500) in `src/lib/services/flashcard-generator.ts:24`.
  - `ProposalCard.tsx`: inline edit with character counters and limits from `src/lib/flashcard-limits.ts`.
  - `requestJson` in `src/lib/request-json.ts`, which accepts `init` and therefore handles PATCH and DELETE.
  - `json`/`jsonError`/`bodyTooLarge` in `src/lib/api-response.ts`.
  - The page shell used by `generate.astro` and `review.astro`.

## Desired End State

- `/flashcards` lists the user's cards, 50 per page, ordered `created_at desc, id desc`. Each card shows front, back and a source badge (AI / AI edytowana / Ręczna). Pagination controls show "strona X z Y". An empty deck shows a call to action linking to `/generate`.
- "Edytuj" turns a card into an inline form (front/back, live counters, Zapisz/Anuluj). One card is in edit mode at a time. Saving persists the trimmed content and keeps the SRS schedule. If the content actually changed, a card with `source = 'ai'` becomes `'ai-edited'`.
- "Usuń" swaps the card's actions for "Na pewno usunąć? Usuń / Anuluj". Confirming hard-deletes the card, together with its review logs, and reloads the current page. If the page becomes empty, the UI moves back one page.
- Users cannot update or delete another user's cards. Direct PostgREST calls cannot change SRS columns, `source`, `user_id` or `generation_id`.
- The dashboard links to "Moje fiszki".

### Key Discoveries:

- RPC + errcode pattern to mirror: `supabase/migrations/20261031220000_harden_review_flashcard.sql:43-62` and the errcode→HTTP mapping in `src/pages/api/reviews/index.ts:100-112`.
- Content schema to reuse: `src/lib/services/flashcard-generator.ts:24` (`ProposalSchema`).
- Inline-edit UI to mirror: `src/components/generate/ProposalCard.tsx:46-63` (draft state, `draftValid`), `:104-161` (form).
- Supabase default grants already give `authenticated` table-level UPDATE/DELETE privileges, so only RLS policies gate them. Absence of an UPDATE policy means direct updates touch 0 rows, which is what we want.
- `SECURITY DEFINER` functions run as owner and are not affected by RLS. `review_flashcard` keeps working regardless of the policies added here.

## What We're NOT Doing

- Search, filtering or sorting controls (decision: scope = list + edit + delete only).
- Resetting SRS state on edit, or offering a "start learning again" option. The schedule is always preserved.
- Updating `generations.accepted_*_count` on later edits or deletes. Those counts remain a snapshot taken at save time and can diverge from `flashcards.source` by design.
- Soft delete or undo after the delete is confirmed.
- Optimistic concurrency on content edits: last write wins between two tabs. A card deleted in another tab returns 404 on save.
- Persisting the current page in the URL. A refresh returns to page 1.
- Manual card creation (S-04 `manual-flashcard-create`). The page is laid out so S-04 can add a form above the list later.
- Bulk select / bulk delete.

## Implementation Approach

Mirror the existing layering: a migration with the RPC and policies, then thin API routes with zod validation and an errcode mapping, then a React island mounted in an Astro page.

- **Editing:** goes through a new `SECURITY DEFINER` RPC, `update_flashcard_content`. It is the only path that can change `front`/`back`. It owns the `ai → ai-edited` rule and `updated_at`, and returns the updated row.
- **Deleting:** uses a narrow RLS DELETE policy and a direct `.delete()`. Deleting your own card has no hidden invariants, so an RPC would add nothing.
- **Listing:** uses offset pagination through `.range()` with `count: 'exact'`, backed by a new index.

## Critical Implementation Details

- **No-op edits must not flip `source`.** The RPC compares the trimmed new content to the stored values with `is distinct from`. Only a real change flips `'ai'` to `'ai-edited'` and bumps `updated_at`. Saving unchanged text still returns 200 with the current row.
- **Direct RPC calls bypass zod.** Reject blank-after-trim values (`btrim(p_front) = ''`) in SQL and store `btrim`-ed values. The table's `char_length` checks still cap the lengths; map their violation (`23514`) to 400.
- **Past-end pages are an error in PostgREST, not an empty result.** With `count: 'exact'`, an offset greater than the total returns `416 / PGRST103` (PostgREST `RangeQuery.hs`: `lower > total`). An offset equal to the total returns an empty 200. Without handling this, a stale page number (deletes in another tab, `?page=999`) becomes a 500, and the UI's "empty page → go back one" logic never fires.
- **Delete must report a missing card.** Delete with `.select("id")` and treat an empty result as 404. Otherwise deleting a non-existent card, or another user's card that RLS hides, silently returns success.

## Phase 1: Data layer

### Overview

Add the database surface for editing and deleting, regenerate the types, and add the shared server-side helpers with unit tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261101120000_flashcards_edit_delete.sql`

**Intent**: Enable owner-only delete, owner-only content edits that preserve SRS state, and an index for the list ordering.

**Contract**:

- `create policy flashcards_delete_own on public.flashcards for delete to authenticated using (user_id = (select auth.uid()));`
- Still **no** UPDATE policy. Add a comment that content changes go only through `update_flashcard_content()`.
- `create index flashcards_user_id_created_at_idx on public.flashcards (user_id, created_at desc, id desc);`
- `update_flashcard_content(p_flashcard_id uuid, p_front text, p_back text) returns public.flashcards` (a single row, not `setof` and not `returns table`), plpgsql, `security definer`, `set search_path = ''`:
  - Why not `returns table (id, front, …)`: in plpgsql those OUT names become variables that collide with the `flashcards` columns ("column reference is ambiguous"), and supabase-js would return an array. With a single composite row, the route receives an object.
  - `auth.uid()` is null, or no row matches `id = p_flashcard_id and user_id = auth.uid()` (`for update`) → raise errcode `FC404`.
  - Either trimmed value is null or empty → raise `22023`.
  - Update `front = btrim(p_front)` and `back = btrim(p_back)`. When the content changes, set `updated_at = now()`, and also `source = 'ai-edited'` if the current source is `'ai'`. When the content is unchanged, write nothing.
  - Return the resulting row (select it `into` a `public.flashcards` variable and `return` it).
  - `revoke execute … from public, anon; grant execute … to authenticated;`

#### 2. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Expose the new RPC to the typed client.

**Contract**: `npx supabase db push`, then `npx supabase gen types typescript --linked > src/db/database.types.ts`. `Functions.update_flashcard_content` is present.

#### 3. Shared DTOs

**File**: `src/types.ts`

**Intent**: Define the API contract between the routes and the island.

**Contract**: Add a `// --- S-03 deck ---` section:

- `FlashcardDto { id: string; front: string; back: string; source: FlashcardSource; createdAt: string }`
- `FlashcardListResponse { cards: FlashcardDto[]; total: number; page: number; pageSize: number }`
- `UpdateFlashcardRequest { front: string; back: string }`
- `UpdateFlashcardResponse { card: FlashcardDto }`

#### 4. Deck service helpers

**File**: `src/lib/services/flashcards.ts` (new) + `src/lib/services/flashcards.test.ts` (new); `src/lib/services/flashcard-generator.ts`, `src/pages/api/generations/[id]/save.ts` (import update)

**Intent**: Keep the pagination math, page parsing, row→DTO mapping and the card-content schema pure and testable, out of the route handlers. The module must not import anything that reaches `astro:env`: `flashcard-generator.ts` imports `ai-client.ts`, which imports `astro:env/server`, and vitest cannot resolve that (`vitest.config.ts` deliberately skips the Astro Vite config).

**Contract**:

- `FLASHCARDS_PAGE_SIZE = 50`
- `PageQuerySchema`: zod. A missing value defaults to 1. Otherwise the value must be an integer ≥ 1; `"0"`, `"-1"`, `"abc"` and `"1.5"` are rejected.
- `pageRange(page) → { from, to }`: 0-based inclusive range for `.range()`.
- `toFlashcardDto(row)`
- `FlashcardContentSchema`: move the body of `ProposalSchema` (`flashcard-generator.ts:24`, trim, `FRONT_MAX_LENGTH`/`BACK_MAX_LENGTH` from `flashcard-limits.ts`) here. `flashcard-generator.ts` and `save.ts` import it from here, so there is one schema. Keep `ProposalSchema` as an alias in the generator if that minimizes churn.
- Imports allowed: `zod`, `@/lib/flashcard-limits`, `@/types`, `@/db/database.types` (types only).

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db push`
- `src/db/database.types.ts` contains `update_flashcard_content`
- Unit tests pass: `npm test` (page parsing edge cases, `pageRange(1) = {0,49}`, `pageRange(3) = {100,149}`, `FlashcardContentSchema` trims and rejects whitespace-only and over-limit content)
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- SQL probe as user A (Supabase SQL editor with `set request.jwt.claims`, or PostgREST with A's token):
  - `update flashcards set due = now() + interval '1 year'` affects 0 rows.
  - `update flashcards set source = 'manual'` affects 0 rows.
- SQL probe: `update_flashcard_content` on user B's card id raises `FC404`; delete of B's card affects 0 rows.
- SQL probe:
  - An unchanged-content call on an `'ai'` card leaves `source = 'ai'` and `updated_at` unchanged.
  - A changed-content call flips the card to `'ai-edited'` and leaves `due`/`reps`/`stability` unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Deck API

### Overview

Three routes: a paginated list, a content edit and a delete, all following the existing route conventions.

### Changes Required:

#### 1. List route

**File**: `src/pages/api/flashcards/index.ts`

**Intent**: Return one page of the caller's cards plus the total count.

**Contract**:

- `export const prerender = false`. `GET`; 401 if `!locals.user`.
- `PageQuerySchema` on `url.searchParams.get("page")`; failure → 400 `validation`.
- Query: `supabase.from("flashcards").select("id, front, back, source, created_at", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to)`. RLS scopes the query to the caller.
- 200 `FlashcardListResponse`. A page past the end returns `cards: []` with the correct `total`. PostgREST answers `PGRST103` (HTTP 416) when offset > total, so the route must handle that error code by running a `select("id", { count: "exact", head: true })` query and returning `200 { cards: [], total, page, pageSize }`.
- A database error → `console.error` with the code only, then 500 "Nie udało się wczytać fiszek."

#### 2. Edit and delete route

**File**: `src/pages/api/flashcards/[id].ts`

**Intent**: Edit content through the RPC, and delete through the DELETE policy.

**Contract**:

- Both handlers validate `params.id` with `z.uuid()` (400 `validation`) and require `locals.user` (401).
- `PATCH`:
  - `bodyTooLarge` → 413. Invalid JSON → 400.
  - `FlashcardContentSchema` validation; failure → 400 "Nieprawidłowa treść fiszki."
  - Call `rpc("update_flashcard_content", …)`. Errcode mapping: `FC404` → 404 `not_found` "Nie znaleziono fiszki."; `22023` and `23514` → 400 `validation`; anything else → 500.
  - Success → 200 `UpdateFlashcardResponse`.
- `DELETE`:
  - `from("flashcards").delete().eq("id", id).select("id")`.
  - An empty result → 404 `not_found`. An error → 500.
  - Success → 200 `{ deleted: true }`. Return a body because `requestJson` requires JSON.
- Import `z` from `zod` (lessons.md rule).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Unit tests still pass: `npm test`

#### Manual Verification (local dev, `curl` with session cookie):

- `GET /api/flashcards`:
  - The first page has ≤ 50 cards in `created_at desc` order.
  - Two calls return an identical order for a same-batch AI save.
  - `?page=0` → 400. `?page=999` → 200 with empty `cards`.
- `PATCH` with whitespace-only front → 400. A valid edit → 200, the returned `source` is `ai-edited` for a former `ai` card, and `/api/reviews/queue` behaviour for that card is unchanged.
- `PATCH` and `DELETE` with another user's card id → 404. Unauthenticated → 401.
- `DELETE` own card → 200. Its `review_logs` rows are gone. A repeated `DELETE` → 404.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Deck UI

### Overview

The `/flashcards` page with a React island: list, inline edit, in-card delete confirmation, pagination and a dashboard link.

### Changes Required:

#### 1. Page

**File**: `src/pages/flashcards.astro`

**Intent**: Shell matching `generate.astro`: title "Moje fiszki", "← Panel" link, `<FlashcardDeck client:load />`.

**Contract**: The route is protected by the default-deny middleware; no middleware change.

#### 2. Data hook

**File**: `src/components/hooks/useFlashcardDeck.ts`

**Intent**: Own page state, loading and error state, and the edit and delete calls.

**Contract**:

- Exposes `{ cards, page, totalPages, status, error, goToPage, updateCard, deleteCard }`.
- `updateCard` replaces the card in place with the server's returned DTO.
- `deleteCard` refetches the current page after success. If the refetch returns empty and `page > 1`, it loads `page - 1`.
- A 404 on edit or delete shows "Ta fiszka już nie istnieje." and refetches.
- Uses `requestJson` with PATCH/DELETE `init`.

#### 3. Components

**Files**:

- `src/components/deck/FlashcardDeck.tsx`: list, empty state, pagination, error banner.
- `src/components/deck/DeckCard.tsx`: single card with view, edit and confirm-delete modes.

**Intent**: Mirror `ProposalCard`'s visual language and inline-edit mechanics: draft state, trimmed-length counters against `FRONT_MAX_LENGTH`/`BACK_MAX_LENGTH`, Zapisz disabled when the draft is invalid or in flight.

**Contract**:

- Only one card in edit or confirm mode at a time. The parent holds `activeId` plus a mode.
- Source badge labels: `ai` → "AI", `ai-edited` → "AI · edytowana", `manual` → "Ręczna".
- Delete flow: "Usuń" → inline "Na pewno usunąć tę fiszkę? Historia powtórek też zostanie usunięta." with Usuń (red) and Anuluj.
- Pagination: "Poprzednia" / "Strona X z Y" / "Następna", disabled at the bounds and while loading. Hidden when `totalPages ≤ 1`.
- Empty deck: "Nie masz jeszcze fiszek." plus a link to `/generate`.
- Use `cn()` for conditional classes and the shadcn `Button`.

#### 4. Dashboard link

**File**: `src/pages/dashboard.astro`

**Intent**: Make the deck reachable.

**Contract**: Add a "Moje fiszki" link to `/flashcards` in the button row. Show it when `flashcardCount !== 0`, the same rule as the review link.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Unit tests still pass: `npm test`

#### Manual Verification:

- With 0 cards: the empty state with a `/generate` link shows, and there is no "Moje fiszki" link on the dashboard.
- With > 50 cards (generate a few batches, or seed via SQL): pagination works, "Strona X z Y" is correct and the order is stable across refreshes.
- Edit an AI card's back:
  - The badge becomes "AI · edytowana" and the content persists after a refresh.
  - The card's next review date is unchanged (SQL `due` before and after).
- Editing a second card while one is open closes the first. Anuluj restores the original text. The counters turn red over the limit and Zapisz disables.
- Delete with confirmation: the card disappears and the dashboard count drops. Deleting the last card on the last page moves back one page.
- Signed-out visit to `/flashcards` redirects to sign-in with `next=/flashcards`.
- No regressions: `/generate` save and `/review` session still work.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Production rollout & evidence

### Overview

Merge to `main` (auto-deploy through the Cloudflare Git integration), verify the migration on production (it was already pushed to the linked project in Phase 1), verify isolation and the end-to-end flow, and record evidence.

### Changes Required:

#### 1. Evidence

**File**: `context/changes/deck-browse-edit-delete/change.md`

**Intent**: Record production verification.

**Contract**: An `## Evidence` section with the migration applied (timestamp), the two-account isolation check results, the edit/delete happy path, and `wrangler tail` `cpuTime` for `GET /api/flashcards`.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes on merged `main`
- `npm test` passes on merged `main`

#### Manual Verification:

- Production, two accounts:
  - Each sees only its own cards on `/flashcards`.
  - `PATCH` and `DELETE` on the other account's card id → 404.
- Production: edit and delete work end-to-end. An edited `ai` card shows "AI · edytowana", and its `due` is unchanged.
- `wrangler tail`: `cpuTime` for `GET /api/flashcards` is recorded and within the Workers limit.
- No regressions: `/generate` save and the `/review` session work on production.

**Implementation Note**: After completing this phase, confirm with the human before closing out the change.

---

## Testing Strategy

### Unit Tests:

- `src/lib/services/flashcards.test.ts`:
  - `PageQuerySchema`: missing → 1; `"2"` → 2; rejects `"0"`, `"-1"`, `"abc"`, `"1.5"`.
  - `pageRange`: page boundaries.
  - `FlashcardContentSchema`: trims; rejects empty, whitespace-only, 201-char front and 501-char back; accepts exact limits.
  - `toFlashcardDto`: field mapping.

### Integration Tests (manual SQL / PostgREST probes):

- Direct UPDATE of SRS columns or `source` affects 0 rows.
- Cross-user RPC → `FC404`; cross-user DELETE → 0 rows.
- No-op edit keeps `source = 'ai'`. Changed edit flips it to `'ai-edited'`. SRS columns are untouched.
- Delete cascades `review_logs`.

### Manual Testing Steps:

1. Generate and save a batch of 20, then open `/flashcards`: all 20 appear in a stable order across 3 refreshes.
2. Edit one card's back and save: the badge changes, the content persists after a refresh, and `due` is unchanged in SQL.
3. Delete a card after confirming: it is gone and the dashboard count drops by 1.
4. With 51 cards, delete the only card on page 2: the UI lands on page 1 with "Strona 1 z 1".

## Performance Considerations

- `count: 'exact'` plus offset paging on `(user_id, created_at desc, id desc)` stays cheap for MVP-sized decks (hundreds to low thousands per user).
- 50 rows × ≤ 700 chars is a small payload, and the work stays well inside the Workers CPU limit. It is measured in Phase 4.

## Migration Notes

- The migration only adds things (a policy, a function, an index). No backfill is needed, and existing rows keep their `source` and SRS state.
- `npx supabase db push` in Phase 1 targets the linked (production) project, the same as in S-05. Production gets the policy and RPC before the code that uses them. That is safe because the change is purely additive and nothing calls the RPC yet. Phase 4 only verifies it.
- Rollback: `drop policy flashcards_delete_own`, `drop function update_flashcard_content(uuid, text, text)`, `drop index flashcards_user_id_created_at_idx`.

## References

- Roadmap: `context/foundation/roadmap.md` (S-03), PRD FR-006 (`context/foundation/prd.md:84`)
- RPC pattern: `supabase/migrations/20261031220000_harden_review_flashcard.sql`
- Route pattern: `src/pages/api/reviews/index.ts`, `src/pages/api/generations/[id]/save.ts`
- Inline-edit UI: `src/components/generate/ProposalCard.tsx`
- Prior slice plan: `context/archive/2026-10-31-srs-review-session/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db push` — 4991d44
- [x] 1.2 `src/db/database.types.ts` contains `update_flashcard_content` — 4991d44
- [x] 1.3 Unit tests pass: `npm test` — 4991d44
- [x] 1.4 Lint passes: `npm run lint` — 4991d44
- [x] 1.5 Build passes: `npm run build` — 4991d44

#### Manual

- [x] 1.6 Direct UPDATE of `due` / `source` affects 0 rows — 4991d44
- [x] 1.7 Cross-user RPC raises `FC404`; cross-user delete affects 0 rows — 4991d44
- [x] 1.8 No-op edit keeps `source = 'ai'`; changed edit flips to `'ai-edited'` and keeps SRS columns — 4991d44

### Phase 2: Deck API

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 6b03fe8
- [x] 2.2 Build passes: `npm run build` — 6b03fe8
- [x] 2.3 Unit tests still pass: `npm test` — 6b03fe8

#### Manual

- [x] 2.4 `GET /api/flashcards` pages correctly, stable order, `?page=0` → 400, past-end → empty — 6b03fe8
- [x] 2.5 `PATCH` validation, `source` flip, SRS behaviour unchanged — 6b03fe8
- [x] 2.6 Cross-user `PATCH` / `DELETE` → 404; unauthenticated → 401 — 6b03fe8
- [x] 2.7 `DELETE` removes card and its `review_logs`; repeat → 404 — 6b03fe8

### Phase 3: Deck UI

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — a1120bf
- [x] 3.2 Build passes: `npm run build` — a1120bf
- [x] 3.3 Unit tests still pass: `npm test` — a1120bf

#### Manual

- [x] 3.4 Empty state and dashboard link visibility — a1120bf
- [x] 3.5 Pagination with > 50 cards, stable order — a1120bf
- [x] 3.6 Inline edit: badge flips, content persists, `due` unchanged — a1120bf
- [x] 3.7 Single active edit, Anuluj restores, counters and limits enforced — a1120bf
- [x] 3.8 Delete confirmation, count drops, last-item-on-page moves back — a1120bf
- [x] 3.9 Signed-out redirect to sign-in with `next=/flashcards` — a1120bf
- [x] 3.10 No regressions in `/generate` and `/review` — a1120bf

### Phase 4: Production rollout & evidence

#### Automated

- [x] 4.1 `npm run build` passes on merged `main`
- [x] 4.2 `npm test` passes on merged `main`

#### Manual

- [x] 4.3 Two-account isolation on production
- [x] 4.4 Edit and delete end-to-end on production
- [x] 4.5 `cpuTime` for `GET /api/flashcards` recorded
- [x] 4.6 No regressions on production

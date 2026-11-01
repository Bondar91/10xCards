# Manual Flashcard Create (S-04) Implementation Plan

## Overview

Let a signed-in user add a flashcard (front + back) by hand, without AI, from the "Moje fiszki" page (`/flashcards`). This delivers roadmap slice S-04 / PRD FR-005. It is also the fallback path behind the PRD guardrail "a failure of the external AI API does not block the app — the user can still create flashcards manually", so the form must be reachable even when the deck is empty.

## Current State Analysis

- **Data layer is already prepared.** `flashcards_insert_own` (`supabase/migrations/20261031180000_tighten_insert_policies.sql:20-27`) allows a direct PostgREST INSERT only when `user_id = auth.uid()`, `source = 'manual'` and `generation_id is null`. `user_id` defaults to `auth.uid()`. The table CHECKs enforce `char_length(front) between 1 and 200` and `char_length(back) between 1 and 500`.
- **SRS state gets defaults.** `due default now()`, `state 0`, `reps 0` and the other FSRS columns have defaults (`20261031210000_srs_review_state.sql:7-18`), so an inserted card is a "New" FSRS card that is due immediately — the same as AI cards.
- **API.** `src/pages/api/flashcards/index.ts` exports only `GET` (paginated list, `created_at desc, id desc`). `[id].ts` has `PATCH` (RPC) and `DELETE`. Shared helpers in `src/lib/services/flashcards.ts`: `FlashcardContentSchema` (trim, 1..200 / 1..500), `toFlashcardDto`, `FlashcardRow`.
- **UI.** `/flashcards` mounts `FlashcardDeck` (`src/components/deck/FlashcardDeck.tsx`), driven by `useFlashcardDeck` (`src/components/hooks/useFlashcardDeck.ts`). The hook already has `reloadAt(page)` with a request-sequence guard and a `busyId` for in-flight edit/delete. `DeckCard` (`src/components/deck/DeckCard.tsx:49-57, 92-139`) contains the front/back textareas with trimmed-length counters and the `draftValid` rule — the exact UI the new form needs.
- **Gap in reachability.** The dashboard hides the "Moje fiszki" link when `flashcardCount === 0` (`src/pages/dashboard.astro:61-71`), and the deck's empty state only offers "Generuj fiszki". A user with an empty deck and a failing AI provider has no route to manual creation today.

## Desired End State

- `/flashcards` shows a "Dodaj fiszkę" control above the list. It expands into a form with "Przód" / "Tył" fields, live trimmed-length counters and a "Dodaj" button.
- Submitting creates a `manual` card. The list reloads page 1 (the new card is on top with the "Ręczna" badge), the total increments, the fields clear, focus returns to "Przód", and the form stays open for the next card.
- One click creates exactly one card: the button and fields are disabled while the request is in flight. Duplicate content is allowed.
- With an empty deck, the empty state shows the form (expanded) next to the "Generuj fiszki" link. The dashboard always shows the "Moje fiszki" link.
- The new card appears in the next `/review` session.
- Direct PostgREST inserts with `source <> 'manual'`, a `generation_id`, or another `user_id` are rejected (already true; verified by probes).

### Key Discoveries:

- No migration needed: the INSERT policy was tightened in S-02 explicitly "reserved for manual cards (S-04)" (`20261031180000_tighten_insert_policies.sql:18`).
- `FlashcardContentSchema` already trims, so the trimmed values are what gets inserted; the DB CHECKs are the backstop (`23514`).
- `requestJson` treats any 2xx with a JSON body as success, so a `201` response works with the existing client helper (`src/lib/request-json.ts:31-34`); `postJson` already exists.
- The deck's "Ręczna" badge and colour already exist (`DeckCard.tsx:26-30, 83`).
- lessons.md: import `z` from `zod`, never `astro/zod`.

## What We're NOT Doing

- No duplicate detection or uniqueness constraint (decided: duplicates allowed; only double-submit is prevented).
- No change to the initial SRS schedule — manual cards are due immediately, like AI cards.
- No manual-create entry point on `/generate` (e.g. on AI failure); the fallback is reached via the dashboard / `/flashcards`.
- No bulk/CSV creation, no tags or decks.
- No new migration, RPC or policy change.
- No metrics for the "75% of cards created with AI" criterion beyond the existing `source` column (it already distinguishes `manual`).
- No idempotency key — the disabled button covers the double-click case; a retry after a network error that actually succeeded can still create a second card (accepted).

## Implementation Approach

Insert directly through PostgREST under the existing owner-only, `manual`-only INSERT policy, mirroring how `DELETE` uses a direct statement under its policy. Extract the front/back fields + counters from `DeckCard` into a shared component so the edit mode and the new form have one source of truth for limits and validation. The hook gains `createCard`, which on success reloads page 1 via the existing `reloadAt`.

## Critical Implementation Details

- **State sequencing in the hook.** `createCard` must not let a pending edit/delete and a create race over the same list reload: while `creating` is true, card actions and pagination are disabled; while `busyId !== null`, "Dodaj" is disabled. On failure the draft is kept (only success clears it).
- **Empty-state layout.** The empty state (`deck.status === "ready" && cards.length === 0`) currently returns early. The form must render there too (expanded by default), otherwise the AI-outage fallback is unreachable for new users.

## Phase 1: Create API

### Overview

A `POST /api/flashcards` route that validates content and inserts a manual card for the caller, plus shared types, a pure draft-validation helper, unit tests, and probes confirming the INSERT policy boundary.

### Changes Required:

#### 1. Types

**File**: `src/types.ts`

**Intent**: DTOs for the create call, in the S-03 deck section.

**Contract**: `CreateFlashcardRequest { front: string; back: string }` and `CreateFlashcardResponse { card: FlashcardDto }`.

#### 2. Draft validation helper

**File**: `src/lib/flashcard-limits.ts` (client-safe, already shared by API and islands)

**Intent**: Move the trimmed-length rule out of `DeckCard` so the edit form and the new form use the same check, and so it is unit-testable.

**Contract**: `flashcardDraftState(front: string, back: string): { frontLength: number; backLength: number; valid: boolean }` — lengths are of the trimmed strings; `valid` iff both are within `1..FRONT_MAX_LENGTH` / `1..BACK_MAX_LENGTH`. Must match `FlashcardContentSchema` semantics.

#### 3. Create route

**File**: `src/pages/api/flashcards/index.ts`

**Intent**: Add `POST` next to the existing `GET`.

**Contract**:

- 401 if `!locals.user`. `bodyTooLarge` → 413. Invalid JSON → 400 `validation`.
- `FlashcardContentSchema.safeParse(body)`; failure → 400 `validation` "Nieprawidłowa treść fiszki."
- `createClient` null → 503 `config`.
- `supabase.from("flashcards").insert({ front, back, source: "manual" }).select("id, front, back, source, created_at").single()` — do not send `user_id` or `generation_id` (defaults + policy).
- Error mapping: `23514` → 400 `validation`; anything else (incl. `42501` RLS) → `console.error` with code only, 500 "Nie udało się dodać fiszki. Spróbuj ponownie."
- Success → **201** `CreateFlashcardResponse` with `toFlashcardDto(row)`.

#### 4. Unit tests

**File**: `src/lib/flashcard-limits.test.ts` (new)

**Intent**: Cover `flashcardDraftState`: whitespace-only is invalid, leading/trailing spaces don't count, exactly 200 / 500 is valid, 201 / 501 invalid; and parity with `FlashcardContentSchema` on the same inputs.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Local dev, `curl` with session cookie: `POST /api/flashcards` with valid content → 201, `source: "manual"`, trimmed values; whitespace-only front → 400; front of 201 chars → 400; invalid JSON → 400; unauthenticated → 401.
- SQL / PostgREST probe as user A: direct insert with `source = 'ai'` → rejected (RLS); with `generation_id` set → rejected; with `user_id` = user B → rejected.
- SQL: the created card has `due <= now()`, `state = 0`, `reps = 0`, and appears in `GET /api/reviews/queue`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Create UI

### Overview

The "Dodaj fiszkę" form on `/flashcards` (including the empty state), the hook method, the shared fields component, and an always-visible dashboard link.

### Changes Required:

#### 1. Shared fields component

**File**: `src/components/deck/FlashcardFields.tsx` (new); `src/components/deck/DeckCard.tsx` (refactor to use it)

**Intent**: One component for the "Przód" / "Tył" textareas with trimmed-length counters (red over the limit), used by `DeckCard`'s edit mode and the new form. `DeckCard` behaviour must stay identical.

**Contract**: Props `{ front, back, onFrontChange, onBackChange, disabled, frontRef? }`; validity comes from `flashcardDraftState`. Use `cn()` for conditional classes.

#### 2. Hook

**File**: `src/components/hooks/useFlashcardDeck.ts`

**Intent**: Add creation to the deck hook.

**Contract**:

- New state `creating: boolean`, exposed.
- `createCard(content: CreateFlashcardRequest): Promise<boolean>` — `postJson("/api/flashcards", …)`; on success `await reloadAt(1)` and return `true`; on failure set `error` to the result message and return `false`.

#### 3. New-card form

**File**: `src/components/deck/NewFlashcardForm.tsx` (new)

**Intent**: Collapsible form above the list.

**Contract**:

- Collapsed: a "Dodaj fiszkę" button (`Plus` icon). Expanded: `FlashcardFields` + "Dodaj" (purple, disabled when `!valid || creating || disabled`) + "Anuluj" (collapses and clears).
- Prop `defaultOpen` (true in the empty state) and `disabled` (true while `busyId !== null` or the list is loading).
- Submit via the button or Ctrl/Cmd+Enter. On success: clear both fields, keep the form open, focus "Przód". On failure: keep the draft.

#### 4. Deck integration

**File**: `src/components/deck/FlashcardDeck.tsx`

**Intent**: Render the form in both the empty state and the list view; lock card actions and pagination while `creating`.

**Contract**:

- List view: form above "Fiszek w talii: N".
- Empty state: form expanded, plus the existing "Generuj fiszki" link; copy "Nie masz jeszcze fiszek. Dodaj pierwszą ręcznie albo wygeneruj je z tekstu."
- `navLocked` and `DeckCard.disabled` also include `deck.creating`. Clicking "Dodaj fiszkę" clears any active edit/confirm card (`setActive(null)`).

#### 5. Dashboard link

**File**: `src/pages/dashboard.astro`

**Intent**: Make manual creation reachable with an empty deck.

**Contract**: The "Moje fiszki" link renders unconditionally. "Rozpocznij powtórki" keeps its `flashcardCount !== 0` rule.

### Success Criteria:

#### Automated Verification:

- Unit tests still pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Fresh account (0 cards): dashboard shows "Moje fiszki"; `/flashcards` shows the expanded form; adding a card replaces the empty state with the list (1 card, badge "Ręczna").
- On page 3 of a > 100-card deck: adding a card lands on page 1 with the new card on top; "Fiszek w talii" increments; the form stays open with empty fields and focus on "Przód".
- Rapid double-click on "Dodaj" creates exactly one card.
- Counters turn red over 200 / 500 and "Dodaj" disables; whitespace-only fields keep "Dodaj" disabled.
- Simulated server failure (e.g. stop local Supabase): an error banner shows and the draft is preserved.
- `DeckCard` edit still works exactly as before (counters, Zapisz/Anuluj).
- The new card appears in a `/review` session.
- No regressions: `/generate` save and `/review` work.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Production rollout & evidence

### Overview

Merge to `main` (auto-deploy via the Cloudflare Git integration), verify the flow and the isolation boundary on production, and record evidence. No migration to apply.

### Changes Required:

#### 1. Evidence

**File**: `context/changes/manual-flashcard-create/change.md`

**Intent**: Record production verification.

**Contract**: An `## Evidence` section with: empty-deck → manual create on production, two-account isolation result, the RLS probe results (non-`manual` insert rejected), and `wrangler tail` `cpuTime` for `POST /api/flashcards`.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes on merged `main`
- `npm test` passes on merged `main`

#### Manual Verification:

- Production, fresh account: dashboard → "Moje fiszki" → add a card → it is listed as "Ręczna" and shows up in `/review`.
- Production, two accounts: a card created by A is not visible to B.
- Production PostgREST probe with A's token: insert with `source = 'ai'` → rejected.
- `wrangler tail`: `cpuTime` for `POST /api/flashcards` recorded and within the Workers limit.
- No regressions: `/generate` save, deck edit/delete and `/review` work on production.

**Implementation Note**: After completing this phase, confirm with the human before closing out the change.

---

## Testing Strategy

### Unit Tests:

- `flashcardDraftState`: trimming, whitespace-only, boundary lengths (200/201, 500/501), parity with `FlashcardContentSchema`.
- Existing `FlashcardContentSchema` / `toFlashcardDto` tests keep passing.

### Integration Tests (manual SQL / PostgREST probes):

- Direct inserts with `source = 'ai'`, a non-null `generation_id`, or a foreign `user_id` are rejected by `flashcards_insert_own`.
- A created card has FSRS defaults and is due immediately.

### Manual Testing Steps:

1. Fresh account → dashboard "Moje fiszki" → add a card from the empty state.
2. Large deck, page 3 → add a card → lands on page 1, form ready for the next card.
3. Double-click "Dodaj" → one card.
4. Over-limit and whitespace-only drafts → "Dodaj" disabled.
5. Server failure → error banner, draft kept.
6. Start `/review` → the manual card is in the queue.

## Performance Considerations

One INSERT + one page-1 list reload per creation; both use existing indexes (`flashcards_user_id_created_at_idx`). Negligible CPU on Workers.

## Migration Notes

None. The schema and INSERT policy already support manual cards. Rollback = revert the code; manual cards created meanwhile stay valid rows.

## References

- Roadmap: `context/foundation/roadmap.md` (S-04)
- PRD: FR-005, guardrail "AI failure does not block manual creation"
- Prior slice (pattern source): `context/archive/2026-11-01-deck-browse-edit-delete/plan.md`
- INSERT policy: `supabase/migrations/20261031180000_tighten_insert_policies.sql:18-27`
- Edit fields to extract: `src/components/deck/DeckCard.tsx:49-57, 92-139`
- Dashboard link rule: `src/pages/dashboard.astro:61-71`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Create API

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — 341ef0c
- [x] 1.2 Lint passes: `npm run lint` — 341ef0c
- [x] 1.3 Build passes: `npm run build` — 341ef0c

#### Manual

- [x] 1.4 `curl` checks of `POST /api/flashcards` (201 / 400 / 401) — 341ef0c
- [x] 1.5 RLS probes: non-manual, generation_id and foreign user_id inserts rejected — 341ef0c
- [x] 1.6 Created card has FSRS defaults and is in the review queue — 341ef0c

### Phase 2: Create UI

#### Automated

- [x] 2.1 Unit tests still pass: `npm test` — 93d7146
- [x] 2.2 Lint passes: `npm run lint` — 93d7146
- [x] 2.3 Build passes: `npm run build` — 93d7146

#### Manual

- [x] 2.4 Fresh account: dashboard link and empty-state form create the first card — 93d7146
- [x] 2.5 Add from page 3 lands on page 1, form stays open with focus on Przód — 93d7146
- [x] 2.6 Double-click creates exactly one card — 93d7146
- [x] 2.7 Counters and Dodaj disable on invalid drafts — 93d7146
- [x] 2.8 Server failure shows error and keeps the draft — 93d7146
- [x] 2.9 DeckCard edit unchanged after refactor — 93d7146
- [x] 2.10 New card appears in /review — 93d7146
- [x] 2.11 No regressions in /generate and /review — 93d7146

### Phase 3: Production rollout & evidence

#### Automated

- [x] 3.1 `npm run build` passes on merged `main`
- [x] 3.2 `npm test` passes on merged `main`

#### Manual

- [x] 3.3 Production fresh-account manual create end-to-end
- [x] 3.4 Production two-account isolation
- [x] 3.5 Production PostgREST probe: `source = 'ai'` insert rejected
- [x] 3.6 `wrangler tail` cpuTime for POST recorded
- [x] 3.7 No regressions on production

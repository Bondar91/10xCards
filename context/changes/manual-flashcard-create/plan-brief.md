# Manual Flashcard Create (S-04) — Plan Brief

> Full plan: `context/changes/manual-flashcard-create/plan.md`

## What & Why

A signed-in user can add a flashcard (front + back) by hand, without AI, from the "Moje fiszki" page. This is roadmap slice S-04 / PRD FR-005. It is also the fallback behind the PRD guardrail: when the AI provider fails, the user can still create cards manually.

## Starting Point

The database is ready: the `flashcards_insert_own` RLS policy already allows direct inserts only for `source = 'manual'` cards owned by the caller, and FSRS columns default to a "New" card that is due now. `/api/flashcards` has only `GET`, and `/flashcards` lists, edits and deletes cards. The dashboard hides "Moje fiszki" when the deck is empty, so an empty-deck user has no path to manual creation.

## Desired End State

`/flashcards` has a collapsible "Dodaj fiszkę" form. A successful add reloads page 1 with the new "Ręczna" card on top, clears the fields, and keeps the form open for the next card. An empty deck shows the form expanded, and the dashboard always links to "Moje fiszki". New cards show up in the next review session.

## Key Decisions Made

| Decision            | Choice                                                    | Why (1 sentence)                                                                 |
| ------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Location            | Form on `/flashcards`, dashboard link always visible      | Matches the S-03 layout and makes the AI-outage fallback reachable with 0 cards. |
| Duplicates          | Allowed; only double-submit is blocked                    | No extra logic or index; AI saves can already produce duplicates.                |
| After adding        | Reload page 1, form stays open, fields cleared, focus on Przód | The user sees the result, and adding cards in a row is fast.                 |
| Initial SRS         | Due immediately (current DB defaults)                     | Same as AI cards; no schema change.                                              |
| Write path          | Direct INSERT under the existing RLS policy, no RPC/migration | The policy already restricts inserts to `manual`, owner-only cards.          |
| Field UI            | Extract `FlashcardFields` + `flashcardDraftState` from `DeckCard` | One source of truth for limits in edit and create.                        |
| Testing             | Vitest + RLS probes + production phase                    | Same pattern as S-03; checks the security boundary directly.                     |

## Scope

**In scope:**

- `POST /api/flashcards` returning 201 with the new card.
- A shared draft-validation helper with unit tests.
- `FlashcardFields` component, `createCard` in the hook, `NewFlashcardForm` in the list and empty state.
- Dashboard link always visible.
- Production verification.

**Out of scope:**

- Duplicate detection.
- Changing the initial SRS schedule.
- A manual-create entry point on `/generate`.
- Bulk/CSV import.
- Idempotency keys.
- Migrations and policy changes.

## Architecture / Approach

`NewFlashcardForm` calls `useFlashcardDeck.createCard`, which sends `postJson` to `POST /api/flashcards`. The route validates the body with `FlashcardContentSchema` and runs `insert({ front, back, source: 'manual' }).select().single()`, so RLS enforces the owner and the `manual` source. On success the hook calls `reloadAt(1)`. Card actions and paging are locked while a create is in flight, and the create button is locked while an edit or delete is in flight.

## Phases at a Glance

| Phase                  | What it delivers                                   | Key risk                                                   |
| ---------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| 1. Create API          | POST route, types, draft helper + tests, RLS probes | Error mapping that hides an RLS rejection as a 400         |
| 2. Create UI           | Form in list and empty state, hook, dashboard link | `DeckCard` regression from extracting the fields; create/edit race |
| 3. Production rollout  | Deploy, empty-deck flow, isolation, evidence       | None beyond the usual deploy checks (no migration)         |

**Prerequisites:** S-02 and S-03 are done. Two test accounts are available on production.

**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- A retry after a network error whose request actually succeeded can create a second card. This is accepted, since there is no idempotency key.
- Adding many cards in a row grows today's review queue, because new cards are due immediately. This is accepted for consistency with AI cards.

## Success Criteria (Summary)

- A user with an empty deck, even with AI down, can reach "Moje fiszki" from the dashboard and add a card.
- Each click on "Dodaj" creates exactly one `manual` card. It appears on top of page 1 and in the next review session.
- Nobody can insert non-`manual` cards or cards for another user through the API or directly through PostgREST.

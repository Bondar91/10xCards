# Deck Browse, Edit & Delete (S-03) — Plan Brief

> Full plan: `context/changes/deck-browse-edit-delete/plan.md`

## What & Why

A `/flashcards` ("Moje fiszki") page where the user can browse their saved flashcards, fix their content and delete the ones they don't need. This delivers roadmap slice S-03 / PRD FR-006: without editing, AI mistakes stay in the deck permanently.

## Starting Point

Cards are saved by S-02, through the `save_generation` RPC, and scheduled by S-05, through the `review_flashcard` RPC. `flashcards` has only SELECT and INSERT policies; UPDATE and DELETE were explicitly deferred to this slice. There is no list page: the dashboard shows counts only.

## Desired End State

The user opens "Moje fiszki" from the dashboard and sees their cards, newest first, 50 per page, each with a source badge. They can edit a card in place without losing its review schedule, and delete a card after an in-card confirmation. Nobody can touch another user's cards, or change SRS state or `source` through direct API calls.

## Key Decisions Made

| Decision          | Choice                                          | Why (1 sentence)                                                                             |
| ----------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Location / scope  | New `/flashcards` page, no search               | Matches `/review` and `/generate`; strict FR-006 scope; S-04 can add its form here.          |
| Ordering          | `created_at desc, id desc`                      | Fresh AI cards come first; `id` gives a stable order within a batch that shares `created_at`. |
| Scale             | Offset pagination, 50 per page                  | Constant cost regardless of deck size.                                                       |
| SRS on edit       | Schedule preserved                              | Fixing a typo must not erase learning progress.                                              |
| Source on edit    | `ai` → `ai-edited` on a real content change     | `source` honestly reflects whether the content is pure AI output; `generations` counts stay a save-time snapshot. |
| Edit UX           | Inline, one card at a time                      | Reuses the `ProposalCard` pattern and limits.                                                |
| Delete safety     | In-card confirmation, hard delete               | No new dependencies; the cascade removes review history.                                     |
| Edit security     | `SECURITY DEFINER` RPC, no UPDATE policy        | RLS cannot restrict columns; an RPC is the only way to keep SRS columns and `source` tamper-proof. |
| Testing           | Vitest for pure helpers + SQL probes + production phase | The riskiest part is the security policy, so probe it directly.                       |

## Scope

**In scope:**

- Migration: DELETE policy, `update_flashcard_content` RPC, index for the list ordering.
- `GET /api/flashcards?page=N`, `PATCH` / `DELETE /api/flashcards/[id]`.
- `/flashcards` island with list, inline edit, delete confirmation and pagination.
- Dashboard link.
- Production verification.

**Out of scope:**

- Search and filters.
- SRS reset on edit.
- Recomputing `generations` counts.
- Soft delete / undo.
- Edit concurrency control.
- Page number in the URL.
- Manual card creation (S-04).
- Bulk actions.

## Architecture / Approach

The `/flashcards` Astro page mounts the `FlashcardDeck` island, which uses the `useFlashcardDeck` hook and `requestJson` to call the API routes:

- **List:** a direct `.select().range()`; RLS scopes it to the caller.
- **Edit:** the `update_flashcard_content` RPC. It trims, flips `ai` to `ai-edited` only on a real change, and leaves SRS state alone.
- **Delete:** a direct `.delete().select("id")` under a new owner-only DELETE policy; an empty result returns 404.

## Phases at a Glance

| Phase                     | What it delivers                                  | Key risk                                                         |
| ------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| 1. Data layer             | Migration, RPC, types, pure helpers + tests       | Policy gap that lets direct updates or deletes escape owner scope |
| 2. Deck API               | List, edit and delete routes                      | Silent success on a delete that hit 0 rows                       |
| 3. Deck UI                | `/flashcards` page, inline edit, delete, paging   | Paging edge case when deleting the last card on a page           |
| 4. Production rollout     | Migration on production, isolation check, evidence | Migration and deploy ordering                                   |

**Prerequisites:** S-02 and S-05 are done (both are). Supabase CLI is linked to the production project. Two test accounts are available.

**Estimated effort:** ~2 sessions across 4 phases.

## Open Risks & Assumptions

- `flashcards.source` and `generations.accepted_*_count` can diverge after edits. This is an accepted consequence; any future metric has to choose one of them deliberately.
- Offset pagination assumes MVP-sized decks (up to low thousands per user).
- S-04 (`manual-flashcard-create`) is planned in parallel. It will add to the same page, so coordinate the layout of `FlashcardDeck`.

## Success Criteria (Summary)

- The user can find any of their saved cards, fix its text and see the fix persist, with the review schedule intact.
- The user can delete a card after confirming, and it disappears from the deck, the dashboard count and the review queue.
- Cross-user access and SRS or `source` tampering are impossible, as verified on production.

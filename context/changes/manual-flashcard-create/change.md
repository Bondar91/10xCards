---
change_id: manual-flashcard-create
title: Manual flashcard create
status: impl_reviewed
created: 2026-11-01
updated: 2026-11-01
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Implementation deviations

- **Phase 2 — one mounted form instead of `defaultOpen` and two placements** (`NewFlashcardForm.tsx`, `FlashcardDeck.tsx`).
  - **Plan**: a `defaultOpen` prop, with the form rendered separately in the empty state and in the list view.
  - **Problem**: during the page-1 reload after a create, the deck passes through `status: "loading"` with 0 cards. A separate empty-state form would be replaced by the spinner, which unmounts it and loses "stay open, focus Przód".
  - **Implemented**: one `NewFlashcardForm` mounted above the error, spinner, empty and list branches. Its `forceOpen` prop (empty deck) latches the local `open` state during render, so the form stays open after the first card.
  - **impl-review F3**: the error branch (list load failed with no cards) now also keeps the form mounted instead of returning early.

## Evidence

- 2026-11-01 — faza 1 (`341ef0c`): `POST /api/flashcards` zweryfikowany lokalnie przez użytkownika: 201 z `source: "manual"` i przyciętą treścią, 400 dla pustej/za długiej treści i złego JSON, 401 bez sesji. Sondy RLS: bezpośredni INSERT z `source = 'ai'`, z `generation_id` i z cudzym `user_id` odrzucony. Nowa fiszka ma domyślny stan FSRS (`state = 0`, `reps = 0`, `due <= now()`) i trafia do `/api/reviews/queue`.
- 2026-11-01 — faza 2 (`93d7146`): UI zweryfikowane lokalnie przez użytkownika: pusta talia → rozwinięty formularz i link „Moje fiszki” na dashboardzie, dodanie ze strony 3 → strona 1, podwójny klik → jedna fiszka, liczniki i blokada „Dodaj”, zachowanie szkicu przy błędzie, edycja w `DeckCard` bez zmian, fiszka w `/review`, brak regresji.
- 2026-11-01 — `main` wypchnięty na `origin` (`a1120bf..93d7146`, auto-deploy Cloudflare). `npm test` (67) i `npm run build` przechodzą na `main`. Brak migracji do wdrożenia.
- 2026-11-01 — faza 3: weryfikacja produkcyjna potwierdzona przez użytkownika („Sprawdzone wszystko działa”): ręczne dodanie fiszki z pustej talii end-to-end (etykieta „Ręczna”, fiszka w `/review`), izolacja dwóch kont, sonda PostgREST z `source = 'ai'` odrzucona przez RLS, `cpuTime` dla `POST /api/flashcards` w limicie Workers (dokładna wartość niezapisana), brak regresji `/generate`, edycji/usuwania w talii i `/review`.

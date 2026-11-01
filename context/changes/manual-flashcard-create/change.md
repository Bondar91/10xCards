---
change_id: manual-flashcard-create
title: Manual flashcard create
status: implemented
created: 2026-11-01
updated: 2026-11-01
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

## Evidence

- 2026-11-01 — faza 1 (`341ef0c`): `POST /api/flashcards` zweryfikowany lokalnie przez użytkownika: 201 z `source: "manual"` i przyciętą treścią, 400 dla pustej/za długiej treści i złego JSON, 401 bez sesji. Sondy RLS: bezpośredni INSERT z `source = 'ai'`, z `generation_id` i z cudzym `user_id` odrzucony. Nowa fiszka ma domyślny stan FSRS (`state = 0`, `reps = 0`, `due <= now()`) i trafia do `/api/reviews/queue`.
- 2026-11-01 — faza 2 (`93d7146`): UI zweryfikowane lokalnie przez użytkownika: pusta talia → rozwinięty formularz i link „Moje fiszki” na dashboardzie, dodanie ze strony 3 → strona 1, podwójny klik → jedna fiszka, liczniki i blokada „Dodaj”, zachowanie szkicu przy błędzie, edycja w `DeckCard` bez zmian, fiszka w `/review`, brak regresji.
- 2026-11-01 — `main` wypchnięty na `origin` (`a1120bf..93d7146`, auto-deploy Cloudflare). `npm test` (67) i `npm run build` przechodzą na `main`. Brak migracji do wdrożenia.
- 2026-11-01 — faza 3: weryfikacja produkcyjna potwierdzona przez użytkownika („Sprawdzone wszystko działa”): ręczne dodanie fiszki z pustej talii end-to-end (etykieta „Ręczna”, fiszka w `/review`), izolacja dwóch kont, sonda PostgREST z `source = 'ai'` odrzucona przez RLS, `cpuTime` dla `POST /api/flashcards` w limicie Workers (dokładna wartość niezapisana), brak regresji `/generate`, edycji/usuwania w talii i `/review`.

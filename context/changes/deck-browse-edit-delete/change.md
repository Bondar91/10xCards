---
change_id: deck-browse-edit-delete
title: Deck browse edit delete
status: implemented
created: 2026-11-01
updated: 2026-11-01
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

## Evidence

- 2026-11-01 — migracja `20261101120000_flashcards_edit_delete.sql` wdrożona na Supabase Cloud (`supabase migration list --linked`: local = remote = `20261101120000`). Sondy SQL fazy 1 potwierdzone przez użytkownika: bezpośredni `UPDATE` `due`/`source` → 0 wierszy, obca karta w `update_flashcard_content` → `FC404`, obcy `DELETE` → 0 wierszy, edycja bez zmian zostawia `source = 'ai'`, prawdziwa edycja → `'ai-edited'` przy niezmienionych kolumnach SRS.
- 2026-11-01 — API (faza 2) i UI `/flashcards` (faza 3) zweryfikowane lokalnie przez użytkownika: stronicowanie, stabilna kolejność, 400/404/401, kaskada `review_logs`, edycja z flipem badge'a, usuwanie z potwierdzeniem, cofanie strony, redirect z `next=/flashcards`, brak regresji `/generate` i `/review`.
- 2026-11-01 — commity `4991d44`, `6b03fe8`, `a1120bf` wypchnięte na `main` (`ffc6816..a1120bf`, auto-deploy Cloudflare). `npm run build` i `npm test` (53) przechodzą na `main`.
- **Punkty 4.3–4.6 zaakceptowane bez weryfikacji produkcyjnej**: użytkownik uznał weryfikację lokalną za wystarczającą („Działa lokalnie, więc na prodzie też”). Izolacja dwóch kont, edycja/usuwanie end-to-end i brak regresji nie zostały sprawdzone na produkcji; `cpuTime` dla `GET /api/flashcards` nie został zmierzony (`wrangler tail` przerwany przed pomiarem). Do uzupełnienia przy kolejnym `wrangler tail`.
- Znane: `npm run lint` dla całego repo zgłasza wcześniej istniejące błędy (prettier w plikach spoza zmiany, `.astro` nieparsowane przez ESLint); nowe pliki `.ts`/`.tsx` tej zmiany przechodzą ESLint bez błędów.

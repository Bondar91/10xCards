---
change_id: srs-review-session
title: Srs review session
status: implemented
created: 2026-10-31
updated: 2026-10-31
archived_at: null
---

## Notes

- Wybór biblioteki SRS: `ts-fsrs@^5.4.2` (nie 6.0.0 — świeży major, Node >=24). Szczegóły i porównanie: [srs-library-research.md](srs-library-research.md).
- Migracja `20261031210000_srs_review_state.sql` wdrożona na Supabase Cloud 2026-10-31 (`npx supabase db push`). Istniejące fiszki dostały stan `New` z defaultów kolumn (`state = 0`, `reps = 0`, `due` = czas migracji); `src/db/database.types.ts` zregenerowany.

## Evidence

- 2026-10-31 — migracja `20261031210000_srs_review_state.sql` wdrożona na Supabase Cloud; istniejące fiszki z `state = 0`, `reps = 0`, `due` ustawionym (potwierdzone w SQL editorze). RLS: `get_review_queue` i `review_logs` zwracają tylko własne wiersze, bezpośredni insert do `review_logs` odrzucony.
- 2026-10-31 — `ts-fsrs@5.4.2` działa w workerd (`wrangler dev`, faza 2): kolejka z etykietami, requeue, 409 na nieaktualne `expectedReps`, 400/404 na złe dane.
- 2026-10-31 — commity `6db57d8`, `c61e152`, `f5210f1` wypchnięte na `main` (auto-deploy Cloudflare). Weryfikacja produkcyjna potwierdzona przez użytkownika: izolacja dwóch kont (obca karta → 404), „Dobrze” usuwa kartę z kolejki i zmniejsza licznik na panelu, `/generate` zapisuje karty jako New.
- `cpuTime` tras `GET /api/reviews/queue` i `POST /api/reviews` **nie został zanotowany** — użytkownik potwierdził poprawne działanie bez podawania liczb. Do uzupełnienia przy kolejnym `wrangler tail`.

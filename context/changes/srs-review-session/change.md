---
change_id: srs-review-session
title: Srs review session
status: implementing
created: 2026-10-31
updated: 2026-10-31
archived_at: null
---

## Notes

- Wybór biblioteki SRS: `ts-fsrs@^5.4.2` (nie 6.0.0 — świeży major, Node >=24). Szczegóły i porównanie: [srs-library-research.md](srs-library-research.md).
- Migracja `20261031210000_srs_review_state.sql` wdrożona na Supabase Cloud 2026-10-31 (`npx supabase db push`). Istniejące fiszki dostały stan `New` z defaultów kolumn (`state = 0`, `reps = 0`, `due` = czas migracji); `src/db/database.types.ts` zregenerowany.

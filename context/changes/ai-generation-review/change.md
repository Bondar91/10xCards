---
change_id: ai-generation-review
title: Ai generation review
status: implementing
created: 2026-10-31
updated: 2026-10-31
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

## Evidence

- **Phase 1 — migration apply (2026-10-31):** `npx supabase link --project-ref idqndrompbqqdpnzsoon` + `npx supabase db push` (CLI v2.98.2, token auth) applied `20261031120000_flashcards_and_generations.sql` to Supabase Cloud. Types generated with `npx supabase gen types typescript --linked > src/db/database.types.ts`.

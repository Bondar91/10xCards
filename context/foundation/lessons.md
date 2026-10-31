# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Import zod directly, not via astro/zod

- **Context**: src/pages/api/generations/index.ts:2, src/pages/api/generations/[id]/save.ts:2, src/lib/services/flashcard-generator.ts:1 (impl-review ai-generation-review F9)
- **Problem**: Existing auth routes import `astro/zod`; new code imports `zod` (added as a direct dependency per plan). One deduped copy at runtime, but two import styles for the same library make the convention unclear for agents.
- **Rule**: Import validation schemas from `zod` (direct dependency, v4). Do not add new `astro/zod` imports; migrate existing ones when a file is touched anyway.
- **Applies to**: All API routes, services and shared schemas in `src/` (/10x-plan, /10x-implement, /10x-impl-review).

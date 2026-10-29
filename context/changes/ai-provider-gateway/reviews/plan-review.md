<!-- PLAN-REVIEW-REPORT -->
# Plan Review: AI Provider Gateway Implementation Plan

- **Plan**: context/changes/ai-provider-gateway/plan.md
- **Mode**: Deep
- **Date**: 2026-10-29
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 1 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | FAIL → PASS |
| Blind Spots | WARNING → PASS |
| Plan Completeness | WARNING → PASS |

## Grounding
6/6 paths ✓ (2 new dirs correctly absent), 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — OPENROUTER_MODEL as `access: "public"` is fixed at build time

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Critical Implementation Details; Phase 1 §1–2
- **Detail**: `node_modules/astro/dist/env/vite-plugin-env.js:132-140` inlines public server vars at build time; only `server`+`secret` fields resolve at runtime via `_internalGetSecret()` (which applies `default`). A wrangler `vars.OPENROUTER_MODEL` would be ignored.
- **Fix**: Declare `OPENROUTER_MODEL` with `access: "secret"` + `default`; keep it in wrangler `vars`; correct the note.
- **Decision**: FIXED

### F2 — Users would see a global "OpenRouter nie jest skonfigurowany" banner before the secret exists

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §4 vs Phase 3 §1
- **Detail**: `src/layouts/Layout.astro:22-35` shows every `missingConfigs` entry as an error banner on all pages; pushes to `main` auto-deploy; the key was only set in Phase 3.
- **Fix A ⭐ Recommended**: Move `wrangler secret put OPENROUTER_API_KEY` into Phase 1.
- **Fix B**: Drop the config-status entry.
- **Decision**: FIXED (Fix A)

### F3 — `maxTokens ≤ 10` can make the health check fail falsely on reasoning models

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1; Phase 1 §6
- **Detail**: Reasoning tokens use up the tiny budget, `content` comes back empty, and the client reports `upstream` — a false failure.
- **Fix**: Require a non-reasoning model; raise the health call's maxTokens to 32.
- **Decision**: FIXED

### F4 — The `wrangler dev` steps skip the build and assume `npm run dev` runs on Node

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis; Phase 2 Manual
- **Detail**: `wrangler dev` serves the built `./dist`; CLAUDE.md contradicts the "Node" claim.
- **Fix**: Prefix with `npm run build && npx wrangler dev`; soften the claim.
- **Decision**: FIXED

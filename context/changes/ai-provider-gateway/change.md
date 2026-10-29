---
change_id: ai-provider-gateway
title: AI provider gateway — server-side LLM call on production with no text retention
status: implementing
created: 2026-10-29
updated: 2026-10-29
archived_at: null
---

## Notes

Roadmap item F-01 (issue https://github.com/Bondar91/10xCards/issues/1) from `context/foundation/roadmap.md`.

- **Outcome:** (foundation) one server-side call to the chosen LLM provider works on the deployed Worker, with the API key in secrets, within the runtime CPU limit, and the provider's retention policy confirmed compatible with "submitted text leaves no trace".
- **PRD refs:** FR-003, NFR AI privacy
- **Unlocks:** S-02 (ai-generation-review)
- **Parallel with:** S-01 (account-access-production)
- **Unknown (owner: user, non-blocking):** which provider/model guarantees no retention of submitted text — resolved within this change.
- **Scope guard:** only "one call works on production"; prompt design, flashcard parsing, and UI belong to S-02.

## Evidence

- **1.4 Model**: `mistralai/mistral-small-3.2-24b-instruct` (non-reasoning). ZDR endpoints confirmed 2026-10-29 via `GET https://openrouter.ai/api/v1/endpoints/zdr`: Mistral, DeepInfra, Parasail, Venice (~$0.075–0.10 / $0.20–0.30 per 1M tokens in/out).
- **1.1 Lint note**: `npm run lint` already fails on HEAD (52 pre-existing errors in untouched files, incl. `.astro` parse errors); files changed in Phase 1 lint clean via `npx eslint <files>`.
- **1.6 Secret**: `OPENROUTER_API_KEY` set on production by the user 2026-10-29 (not verifiable from the agent session — wrangler OAuth token expired; check with `npx wrangler secret list` in Phase 3). Key was pasted into the agent chat — rotate after Phase 3.
- **Phase 2 (wrangler dev, 2026-10-29)**: anon → 401; logged-in → 200 `{model: mistralai/mistral-small-3.2-24b-instruct, latencyMs: 479}`; key removed → 503 `config`; no prompt text in dev logs. Direct OpenRouter call with ZDR flags was served by DeepInfra. Note: Astro `checkOrigin` returns 403 to a bare `curl -X POST` — add `-H 'Content-Type: application/json'` for curl checks.
- **Phase 3 (production, 2026-10-29)**: https://10xcards.krystian-bondaruk.workers.dev — secret present (`wrangler secret list`); anon POST → 401 (bare `curl -X POST` → 403 from `checkOrigin`); logged-in POST → 200 `{model: mistralai/mistral-small-3.2-24b-instruct, latencyMs: 435}`; `wrangler tail`: **cpuTime 5 ms** / wallTime 510 ms (≤ 10 ms ✓); 0 prompt-text hits in tail logs; OpenRouter activity confirmed by user as served by a ZDR provider. Side observation: `GET /auth/signin` SSR measured 22 ms CPU (outcome ok) — relevant to S-01/S-02 CPU budget.

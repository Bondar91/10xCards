# AI Provider Gateway — Plan Brief

> Full plan: `context/changes/ai-provider-gateway/plan.md`

## What & Why

Roadmap F-01: a minimal server-side gateway to OpenRouter, proven on the deployed Cloudflare Worker. It retires the two unknowns blocking the north-star slice S-02 — which provider/model satisfies the PRD rule "text submitted to AI leaves no trace", and whether an AI route fits the Workers CPU limit.

## Starting Point

No AI code, secret, or route exists. The app has `astro:env` secrets for Supabase, a `config-status` warning pattern, auth-only form routes, and auto-deploy to Workers from `main`. `infrastructure.md` already assumes OpenRouter and flags the 10 ms free-tier CPU limit.

## Desired End State

`src/lib/services/ai-client.ts` calls OpenRouter with Zero Data Retention enforced on every request and returns typed errors. An auth-only `POST /api/ai/health` proves a production call works; the measured CPU time and the ZDR confirmation are recorded so S-02 plans from evidence.

## Key Decisions Made

| Decision        | Choice                                                         | Why (1 sentence)                                                                 |
| --------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Provider        | OpenRouter via plain `fetch`                                   | Matches infrastructure.md, per-request privacy controls, model is a config string |
| Retention       | `zdr: true`, `data_collection: "deny"`, `allow_fallbacks: false` per request + account ZDR | A no-training host with 30-day abuse logs is rejected — literal reading of the NFR, enforced in code |
| Exposure        | Auth-only `POST /api/ai/health`, fixed prompt                  | Provable on prod; anonymous callers can't spend credits; no user text involved   |
| CPU proof       | Measure `cpuTime` on prod vs 10 ms (free tier)                 | Real evidence on the real runtime; large-input benchmark deferred to S-02        |
| Errors          | Discriminated result (`config`/`timeout`/`rate_limit`/`upstream`), no retry, 25 s timeout | Clean contract for S-02; logs kind/status only, never text |
| Model           | Non-reasoning model picked at implementation time from OpenRouter's live ZDR list; `OPENROUTER_MODEL` runtime var (`access: "secret"` + default) | ZDR availability changes; swappable without code; public astro:env vars are build-time only |
| Secret timing   | Prod `OPENROUTER_API_KEY` set in Phase 1, before any push to `main` | Otherwise the config-status banner shows on every prod page |

## Scope

**In scope:**
- `ai-client.ts` gateway, env schema + wrangler vars + example env files + config-status entry
- `/api/ai/health` smoke route (401 / 200 / 503 / 504)
- Production secret, deploy, CPU and ZDR evidence write-back

**Out of scope:**
- Flashcard prompt, parsing, UI, streaming (S-02)
- Retries, large-input CPU benchmark, Workers Paid upgrade
- Preview-env secrets, test framework

## Architecture / Approach

`POST /api/ai/health` → middleware resolves `locals.user` → route rejects anonymous → `chatCompletion(fixedPrompt)` → `fetch` OpenRouter `/chat/completions` with ZDR provider flags + `AbortController` timeout → typed result → JSON response. Logs carry only kind/status/model/latency.

## Phases at a Glance

| Phase                          | What it delivers                                   | Key risk                                                        |
| ------------------------------ | -------------------------------------------------- | --------------------------------------------------------------- |
| 1. Gateway client and config   | `ai-client.ts` + all config surfaces + model pick  | Chosen model has no ZDR endpoint → every call fails `upstream`   |
| 2. Auth-only smoke route       | `/api/ai/health` verified under `wrangler dev`     | workerd vs Node differences only visible here                   |
| 3. Production rollout/evidence | Live call on prod, `cpuTime` + ZDR recorded        | Middleware + JSON already near 10 ms CPU                        |

**Prerequisites:** OpenRouter account with credits and an API key; a working test account on production (auth exists; S-01 runs in parallel); `wrangler` authenticated.
**Estimated effort:** ~1 session across 3 small phases.

## Open Risks & Assumptions

- OpenRouter docs don't specify the error when no ZDR endpoint matches — treated as generic `upstream`.
- A tiny-prompt CPU measurement doesn't predict large-input parsing cost; S-02 must re-measure.

## Success Criteria (Summary)

- Logged-in POST to production `/api/ai/health` returns 200; anonymous returns 401.
- Measured `cpuTime` for that request is ≤ 10 ms and recorded.
- OpenRouter shows the request was served by a ZDR endpoint, and no prompt text appears in Worker logs.

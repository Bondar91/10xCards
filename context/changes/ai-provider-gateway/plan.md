# AI Provider Gateway Implementation Plan

## Overview

Roadmap item **F-01** (issue #1). Build the thinnest server-side gateway to an LLM provider (OpenRouter) and prove that one call works on the deployed Cloudflare Worker: key held in Workers secrets, request routed only to Zero Data Retention endpoints, CPU time within the free-tier limit. This retires the two unknowns blocking S-02 (`ai-generation-review`): "which provider/model satisfies no-retention?" and "does an AI route fit the Workers CPU limit?".

## Current State Analysis

- No AI integration exists: no provider client, no API key secret, no AI route (roadmap Baseline: "Integracja AI: absent").
- Server env is declared via `astro:env` in `astro.config.mjs:19-24` — two optional secrets (`SUPABASE_URL`, `SUPABASE_KEY`) read from `astro:env/server` (`src/lib/supabase.ts:3`).
- Missing configuration is surfaced via `src/lib/config-status.ts` (array of `ConfigStatus`, Polish messages).
- Only API routes are auth form handlers (`src/pages/api/auth/*.ts`) — form data, redirects, no zod, no JSON responses.
- `src/middleware.ts` resolves `context.locals.user` on every request via `supabase.auth.getUser()` — this CPU cost is counted in the same per-request budget as any AI route.
- `wrangler.jsonc` has empty `vars: {}` for prod and `env.preview`, with comments documenting `wrangler secret put` for secrets. Deploy is Cloudflare Git integration on push to `main`.
- `infrastructure.md` already assumes OpenRouter (`OPENROUTER_API_KEY`) and flags the 10 ms free-tier CPU limit as a risk (I/O wait does not count; synchronous parsing does).
- Sources disagree on whether `npm run dev` runs in workerd (CLAUDE.md says yes; deployment-plan Phase 5 / infrastructure.md say Node). Use `npm run build && npx wrangler dev` for local verification so it matches production regardless.

## Desired End State

- `src/lib/services/ai-client.ts` exposes a single `chatCompletion` function that calls OpenRouter via `fetch`, **always** sends `provider: { zdr: true, data_collection: "deny", allow_fallbacks: false }`, enforces a timeout, and returns a discriminated result instead of throwing. It never logs or echoes the prompt text.
- `OPENROUTER_API_KEY` is a Workers secret (prod); `OPENROUTER_MODEL` is a non-secret var in `wrangler.jsonc`.
- `POST /api/ai/health` exists: 401 JSON for anonymous callers; for a logged-in user it sends a fixed tiny prompt and returns `{ ok, model, latencyMs }` (no completion text echoed beyond a short fixed check), or 503/504 with a Polish message on failure.
- Production evidence is recorded in this plan's Progress notes: chosen model + date its ZDR endpoint was confirmed, a successful production call, and measured `cpuTime` for that request vs the 10 ms limit.

Verification: logged-in `POST` to the production `/api/ai/health` returns 200; anonymous returns 401; `wrangler tail` shows the request's CPU time ≤ 10 ms.

### Key Discoveries:

- OpenRouter provider routing (docs, checked 2026-10-29): `provider.zdr: true` restricts to ZDR endpoints and is OR'd with account-level ZDR; `provider.data_collection: "deny"` excludes providers that store data; `allow_fallbacks: false` prevents fallback outside the specified constraint set. Docs do not specify the error returned when no endpoint matches `zdr` — treat any non-2xx as `upstream` error.
- Env pattern to follow: `astro.config.mjs:19-24` (`envField.string({ context: "server", access: "secret", optional: true })`).
- Config warning pattern: `src/lib/config-status.ts:11-19`.
- `wrangler.jsonc` comments state secrets never go in the file; preview secrets don't inherit from production.

## What We're NOT Doing

- No flashcard prompt design, JSON/flashcard parsing, or UI — all S-02.
- No large-input (~3,000-word) CPU benchmark — deferred to S-02, where real prompts and parsing exist.
- No retries — S-02 tunes retry policy with real prompts.
- No streaming/SSE.
- No OpenAI/Anthropic SDK dependency — plain `fetch` against the OpenAI-compatible endpoint.
- No preview-env secret setup (optional; documented only).
- No Workers Paid upgrade.
- No unit-test framework introduction (repo has none; verification is lint/build + live smoke calls).

## Implementation Approach

Keep the gateway a pure library module with a small typed contract so S-02 can call it directly from its generation route. Retention is enforced **in code on every request** (not only in the OpenRouter dashboard), so the guarantee is visible in the repo and survives key/account changes. Prove it on production through an auth-gated smoke route that uses a fixed prompt, so no user text is involved and anonymous callers cannot spend credits.

## Critical Implementation Details

- **No text in logs**: the NFR ("text leaves no trace in operator-accessible storage") covers our own logs too — Workers observability is enabled and `wrangler tail` output is operator-accessible. Log only error `kind`, HTTP status, model and latency; never the messages array, the request body, or the upstream response body.
- **CPU measurement**: CPU time per request is visible in `npx wrangler tail --format json` (`cpuTime` in the event outcome) and in the Workers Observability dashboard. Measure the logged-in request, since it includes the middleware's `getUser()` cost.
- **`astro:env` on Cloudflare**: `access: "public"` server vars are inlined into the bundle at **build** time (`node_modules/astro/dist/env/vite-plugin-env.js:132-140`), so a Worker `vars` binding would be ignored. Only `context: "server", access: "secret"` fields are resolved at runtime via `_internalGetSecret()`, which also applies the schema `default`. Declare `OPENROUTER_MODEL` as `access: "secret"` with a `default` — "secret" here means "runtime-read", not confidential — and set it in `wrangler.jsonc` `vars` (and `.dev.vars` locally).
- **Secret before deploy**: `src/layouts/Layout.astro:22-35` renders every `missingConfigs` entry as an error banner on all pages, and pushes to `main` auto-deploy. Set the production `OPENROUTER_API_KEY` secret in Phase 1, before any commit from this change reaches `main`.

## Phase 1: Gateway client and config

### Overview

Add the OpenRouter client module and declare its configuration across all config surfaces.

### Changes Required:

#### 1. Env schema

**File**: `astro.config.mjs`

**Intent**: Declare the provider key and the model id as runtime-read server variables.

**Contract**: `env.schema` gains `OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true })` and `OPENROUTER_MODEL: envField.string({ context: "server", access: "secret", default: "<chosen model id>" })` (`secret` so it is read from Worker bindings at runtime — see Critical Implementation Details).

#### 2. Worker vars

**File**: `wrangler.jsonc`

**Intent**: Set the non-secret model id for production and preview; extend the secrets comments to mention `OPENROUTER_API_KEY`.

**Contract**: `vars.OPENROUTER_MODEL` and `env.preview.vars.OPENROUTER_MODEL` = chosen model id. Comment lists `npx wrangler secret put OPENROUTER_API_KEY` (and `--env preview`).

#### 3. Example env files

**Files**: `.env.example`, `.dev.vars.example`

**Intent**: Document the two new variables for local dev.

**Contract**: Add `OPENROUTER_API_KEY=<your-openrouter-key>` and `OPENROUTER_MODEL=<model id>` with a one-line comment pointing to OpenRouter → Keys.

#### 4. Config status

**File**: `src/lib/config-status.ts`

**Intent**: Surface a missing AI key the same way missing Supabase config is surfaced.

**Contract**: New `ConfigStatus` entry `{ name: "OpenRouter", configured: Boolean(OPENROUTER_API_KEY), message: "OpenRouter nie jest skonfigurowany — generowanie fiszek przez AI jest wyłączone." }`.

#### 5. Gateway client

**File**: `src/lib/services/ai-client.ts` (new)

**Intent**: Single entry point for LLM calls with retention enforced on every request and failures returned as data.

**Contract**:

```ts
export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export type AiErrorKind = "config" | "timeout" | "rate_limit" | "upstream";
export type ChatResult =
  | { ok: true; content: string; model: string; latencyMs: number }
  | { ok: false; kind: AiErrorKind; status?: number; latencyMs: number };

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { maxTokens?: number; timeoutMs?: number } // timeoutMs default 25_000
): Promise<ChatResult>;
```

- `POST https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer <OPENROUTER_API_KEY>`, body includes `model: OPENROUTER_MODEL`, `messages`, `max_tokens`, and `provider: { zdr: true, data_collection: "deny", allow_fallbacks: false }`.
- Missing key → `{ ok: false, kind: "config" }` without a network call.
- `AbortController` timeout → `timeout`; HTTP 429 → `rate_limit`; any other non-2xx, network error, or malformed body (no `choices[0].message.content`) → `upstream`.
- `model` in the success result is the one OpenRouter reports in the response (falls back to the configured id).
- On error, `console.error` with `{ kind, status, model, latencyMs }` only.

#### 6. Model selection

**Intent**: Choose the default model against OpenRouter's live ZDR endpoint list (it changes), not a stale pick.

**Contract**: A cheap, fast, **non-reasoning** instruction-following model that currently lists at least one ZDR endpoint on OpenRouter (reasoning models can spend a small token budget on reasoning and return empty `content`). Record the model id and the date ZDR availability was confirmed in the Phase 1 manual step below.

#### 7. Production secret

**Intent**: Ensure production never runs this code without the key, so the config-status banner never reaches users.

**Contract**: `npx wrangler secret put OPENROUTER_API_KEY` (prompted, not echoed) before any commit from this change is pushed to `main`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Production build passes: `npm run build`
- No prompt/message content is logged: `grep -n "console\." src/lib/services/ai-client.ts` shows only the error log with `kind`/`status`/`model`/`latencyMs`

#### Manual Verification:

- Chosen model id and ZDR-confirmation date recorded in the Progress step note
- OpenRouter account: prompt logging is off and account-level ZDR is enabled (belt and braces with the per-request flag)
- Production secret `OPENROUTER_API_KEY` set via `wrangler secret put` before pushing to `main`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Auth-only smoke route

### Overview

Expose the gateway through a minimal, auth-gated health route and verify it under the real Workers runtime locally.

### Changes Required:

#### 1. Health route

**File**: `src/pages/api/ai/health.ts` (new)

**Intent**: Prove an end-to-end provider call without involving user text and without letting anonymous callers spend credits.

**Contract**:

- `export const prerender = false;` and `export const POST: APIRoute`.
- No `context.locals.user` → `401` JSON `{ ok: false, error: "Wymagane logowanie." }`.
- Calls `chatCompletion` with a fixed system + user prompt (e.g. "Reply with exactly: OK"), `maxTokens: 32`.
- Success → `200` JSON `{ ok: true, model, latencyMs }`.
- Error mapping: `timeout` → `504`; `config` / `rate_limit` / `upstream` → `503`; body `{ ok: false, kind, error: "Usługa AI jest chwilowo niedostępna." }` (config: "Usługa AI nie jest skonfigurowana.").
- No request body is read (nothing to validate, so no zod schema here — S-02's route will validate its input with zod).
- `Content-Type: application/json` on all responses.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Under `npm run build && npx wrangler dev` (with `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in `.dev.vars`; rebuild after every code change — `wrangler dev` serves `./dist`): anonymous `curl -X POST http://localhost:8787/api/ai/health` returns 401
- Under `wrangler dev`, logged-in POST (browser devtools or curl with session cookie) returns 200 with `model` and `latencyMs`
- With `OPENROUTER_API_KEY` removed from `.dev.vars`, logged-in POST returns 503 with the "nie jest skonfigurowana" message and no outbound call
- `wrangler dev` console output contains no prompt text

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Production rollout and evidence

### Overview

Set the production secret, deploy, call the route on production, and record CPU and retention evidence that closes F-01.

### Changes Required:

#### 1. Deploy

**Intent**: Make the gateway live on the production Worker (secret was already set in Phase 1).

**Contract**: `npx wrangler secret list` shows `OPENROUTER_API_KEY`; push to `main` triggers the Cloudflare Git integration deploy (or `npx wrangler deploy`).

#### 2. Evidence write-back

**File**: `context/changes/ai-provider-gateway/plan.md` (Progress notes) and `context/foundation/infrastructure.md` (risk register row for the AI CPU risk)

**Intent**: Persist the measured numbers and retention confirmation so S-02 plans from evidence.

**Contract**: Progress step notes carry: production model id, HTTP status, `latencyMs`, `cpuTime` (ms) from `wrangler tail`. Append a short "Measured 2026-…: smoke call X ms CPU" note to the "AI route exceeds 10ms CPU limit" row's mitigation in `infrastructure.md`.

### Success Criteria:

#### Automated Verification:

- `npx wrangler secret list` includes `OPENROUTER_API_KEY`
- Anonymous `curl -s -o /dev/null -w "%{http_code}" -X POST https://<prod-host>/api/ai/health` returns `401`

#### Manual Verification:

- Logged-in POST to production `/api/ai/health` returns 200 with `model` and `latencyMs`
- `npx wrangler tail --format json` shows `cpuTime` for that request ≤ 10 ms; value recorded
- `wrangler tail` / Workers Observability logs for the request contain no prompt text
- OpenRouter activity log shows the request served by a ZDR endpoint for the chosen model
- Measured CPU note appended to the AI CPU risk row in `context/foundation/infrastructure.md`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None — the repo has no test runner, and the client's logic is a thin mapping exercised by the manual cases below. S-02 may introduce tests around parsing.

### Integration Tests:

- Manual smoke calls against `wrangler dev` (Phase 2) and production (Phase 3) cover: 401 anonymous, 200 success, 503 missing config.

### Manual Testing Steps:

1. `npm run build && npx wrangler dev`, anonymous POST → 401.
2. `wrangler dev`, logged in POST → 200 `{ ok, model, latencyMs }`.
3. Remove key from `.dev.vars`, restart, logged in POST → 503 config.
4. Production: anonymous → 401; logged in → 200; read `cpuTime` in `wrangler tail`.
5. OpenRouter activity: confirm provider endpoint used is ZDR.

## Performance Considerations

The provider call is I/O and does not count toward CPU; the smoke route's CPU is dominated by middleware `getUser()` and JSON (de)serialization of a tiny payload. If measured `cpuTime` already approaches 10 ms here, flag it in S-02's plan as a reason to consider Workers Paid (30 ms) or streaming before heavier parsing lands.

## Migration Notes

None — no data or schema changes. Rollback: revert the commit; the secret can stay or be removed with `npx wrangler secret delete OPENROUTER_API_KEY`.

## References

- Roadmap: `context/foundation/roadmap.md` (F-01)
- PRD NFR (AI privacy): `context/foundation/prd.md:94`
- CPU risk register: `context/foundation/infrastructure.md:81`
- Deployment/secrets procedure: `context/changes/deployment/deployment-plan.md` (Phases 4–6)
- OpenRouter provider routing: https://openrouter.ai/docs/features/provider-routing
- Env pattern: `astro.config.mjs:19-24`; config status: `src/lib/config-status.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Gateway client and config

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 67e5e9f
- [x] 1.2 Production build passes: `npm run build` — 67e5e9f
- [x] 1.3 No prompt/message content is logged in ai-client.ts — 67e5e9f

#### Manual

- [x] 1.4 Chosen model id and ZDR-confirmation date recorded — 67e5e9f
- [x] 1.5 OpenRouter account prompt logging off and account-level ZDR enabled — 67e5e9f
- [x] 1.6 Production secret OPENROUTER_API_KEY set before pushing to main — 67e5e9f

### Phase 2: Auth-only smoke route

#### Automated

- [x] 2.1 Lint passes: `npm run lint`
- [x] 2.2 Production build passes: `npm run build`

#### Manual

- [x] 2.3 wrangler dev: anonymous POST returns 401
- [x] 2.4 wrangler dev: logged-in POST returns 200 with model and latencyMs
- [x] 2.5 wrangler dev: missing key returns 503 config without outbound call
- [x] 2.6 wrangler dev console contains no prompt text

### Phase 3: Production rollout and evidence

#### Automated

- [ ] 3.1 `wrangler secret list` includes OPENROUTER_API_KEY
- [ ] 3.2 Production anonymous POST returns 401

#### Manual

- [ ] 3.3 Production logged-in POST returns 200 with model and latencyMs
- [ ] 3.4 Production cpuTime ≤ 10 ms recorded
- [ ] 3.5 Production logs contain no prompt text
- [ ] 3.6 OpenRouter activity shows ZDR endpoint served the request
- [ ] 3.7 Measured CPU note appended to infrastructure.md risk row

<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI Provider Gateway

- **Plan**: context/changes/ai-provider-gateway/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-10-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Evidence

- Diff `67e5e9f^..0771421`. Every planned file is in the diff except `.env.example` (see F2). No unplanned source files.
- Contracts checked against the code and found to match:
  - `chatCompletion` signature and `ChatResult` union.
  - The privacy routing flags (`zdr`, `data_collection: "deny"`, `allow_fallbacks: false`) are sent on every request.
  - A missing key returns `config` without making a network call.
  - Timeout via `AbortController`, 429 → `rate_limit`, any other non-2xx, network error or malformed body → `upstream`.
  - Errors are logged with only `{kind, status, model, latencyMs}`.
  - `OPENROUTER_MODEL` is declared `access: "secret"` with a default, so it is read at runtime.
  - The health route returns 401/200/503/504 with Polish messages.
- `grep console.` in ai-client.ts: only the error log at line 39. PASS.
- `npm run build`: PASS.
- `npx wrangler secret list`: includes `OPENROUTER_API_KEY`. PASS.
- Anonymous `POST https://10xcards.krystian-bondaruk.workers.dev/api/ai/health` with `Content-Type: application/json`: `401 {"ok":false,"error":"Wymagane logowanie."}`. PASS. Since S-01 shipped, this 401 comes from the middleware; the route's own check is now a second layer of defence.
- `npm run lint`: FAIL (24 errors, none in files from this change). See F3.

## Findings

### F1 — OpenRouter API key pasted into agent chat; rotation not recorded

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/changes/ai-provider-gateway/change.md (Evidence, 1.6)
- **Detail**: Evidence 1.6 says: "Key was pasted into the agent chat — rotate after Phase 3." Phase 3 is closed, but nothing records that the key was rotated. The key is therefore still in session transcripts, which are stored locally under ~/.claude and on the provider side, and it can be used to spend OpenRouter credits.
- **Fix**: Rotate the key in OpenRouter → Keys, run `npx wrangler secret put OPENROUTER_API_KEY` with the new key, update `.dev.vars`, and add a line with the rotation date to Evidence.
- **Decision**: FIXED — key rotated by user 2026-10-31; recorded in change.md Evidence

### F2 — .env.example update never reached the repo (gitignored)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: .gitignore:34 (`.env*`), .env.example
- **Detail**: Plan item 1.3 required both `.env.example` and `.dev.vars.example`. The local `.env.example` does contain the OpenRouter variables, but `.gitignore`'s `.env*` pattern ignores the file, so it has never been committed. The problem existed before this change: the Supabase entries are missing from the repo too. README (lines 41 and 84) and CLAUDE.md tell people to `cp .env.example ...`, so on a fresh clone that command fails. CLAUDE.md "Env vars" also still lists only the Supabase variables.
- **Fix**: Add `!.env.example` to `.gitignore`, commit `.env.example`, and add `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` to the "Env vars" line in CLAUDE.md.
- **Decision**: FIXED — `!.env.example` in .gitignore, .env.example un-ignored, CLAUDE.md Env vars updated

### F3 — "npm run lint passes" ticked while lint fails

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 1.1 / 2.1
- **Detail**: `npm run lint` fails (24 errors). All of them are in files this change did not touch, and most are `.astro` parse errors. Evidence 1.1 records this openly, so the tick is not rubber-stamping. It has the same root cause as `account-access-production/follow-ups/review-fixes.md` F2.
- **Fix**: No separate fix. It is covered by the ESLint/Astro config follow-up already queued in account-access-production.
- **Decision**: SKIPPED — tracked in account-access-production/follow-ups/review-fixes.md

### F4 — Health route lets any signed-up user spend AI credits without a throttle

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/ai/health.ts:29
- **Detail**: Anyone can sign up, so any confirmed account can call `POST /api/ai/health` in a loop. Each call is tiny (max 32 output tokens on a cheap model), so the cost risk is low. The route has no purpose after F-01, though, and adds AI spend surface.
- **Fix**: Note in the S-02 plan input that the route should be removed (or put under the S-02 rate limit) once real generation exists.
- **Decision**: FIXED — S-02 follow-up queued in follow-ups/review-fixes.md

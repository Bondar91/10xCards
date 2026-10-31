---
project: 10xcards
researched_at: 2026-06-14
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: Cloudflare workerd (via @astrojs/cloudflare v13+)
---

## Recommendation

**Deploy on Cloudflare Workers.**

Cloudflare Workers is the strongest fit for this stack: the `@astrojs/cloudflare` adapter (v13+) was purpose-built for the Workers runtime, the free tier comfortably covers the expected 10k–100k monthly request range (100k requests/day included), and the platform's global edge network directly serves the "global reach" requirement. The user already has Cloudflare familiarity, eliminating onboarding friction, and Cloudflare's `llms.txt` + per-product markdown docs are the best agent-readable documentation of any platform researched. The three risks identified in the anti-bias cross-check — the Pages→Workers config migration, the free-tier CPU limit on the AI generation route, and the SRS library ESM requirement — are all tractable and documented in the risk register below.

**⚠ Important:** `@astrojs/cloudflare` v13+ targets Cloudflare **Workers**, not **Pages**. The 10x-astro-starter scaffold includes `wrangler.jsonc` which may be configured for Pages. Before deploying, verify the config and use `wrangler deploy` (Workers), not `wrangler pages deploy` (Pages legacy).

## Platform Comparison

| Platform | CLI-first | Managed | Agent docs | Stable API | MCP | Cost fit | Global reach |
|---|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | **Pass ★** | Pass | Partial (Open Beta) | **Pass (free)** | **Pass ★** |
| Netlify | Pass | Pass | Pass | Partial (no CLI rollback) | **Pass (GA)** | Pass (free) | Pass |
| Vercel | Pass | Pass | Pass | Pass | Partial (Public Beta) | Partial (non-commercial) | Pass |
| Railway | Pass | Pass | Pass | Partial (no CLI rollback) | Pass (GA) | Partial ($5/mo min) | **Fail** (CDN removed May 2026) |
| Fly.io | Pass | Partial (containers) | Partial (no llms.txt) | Pass | Partial (unconfirmed GA) | Partial (no free tier) | Pass |
| Render | Pass | Pass | **Fail** (HTML only) | Pass | Pass (GA) | Pass (free) | **Fail** (single-region SSR) |

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Purpose-built adapter (`@astrojs/cloudflare` v13+), free tier covers the MVP request range with room to spare (100k requests/day), globally distributed edge runtime satisfies the "global reach" constraint, existing user familiarity eliminates onboarding cost, and Cloudflare provides the most comprehensive agent-readable documentation of any platform (llms.txt + per-product markdown). The MCP server is in Open Beta — use `wrangler` CLI for scripted operations at MVP stage. Checked 2026-06-14.

#### 2. Netlify

The strongest MCP offering of all six platforms (official `@netlify/mcp` GA since 2025-06-03 with 20+ tools), confirmed Astro 6 support (`@astrojs/netlify@7`), free tier covers the request range, and `llms.txt` docs are agent-readable. The gap vs. the recommendation: rollback is UI-driven (no CLI rollback command), and the stack requires `@astrojs/netlify` rather than the Cloudflare-native adapter — switching adapters after scaffolding with `@astrojs/cloudflare` is a manual migration step. Checked 2026-06-14.

#### 3. Vercel

Solid Astro 6 support (`@astrojs/vercel`), good CLI coverage including `vercel rollback`, and MCP in Public Beta (August 2025). The gap: Hobby (free) tier is **non-commercial only** — if 10xCards monetizes, a Pro plan ($20/month) is required immediately. The 4-hour active CPU cap on Hobby is a second constraint for SSR-heavy apps. Checked 2026-06-14.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Pages→Workers config migration is a real change, not cosmetic.** The 10x-astro-starter scaffold targets Pages; `@astrojs/cloudflare` v13+ targets Workers. These are different Cloudflare products with different routing, pricing, and `wrangler.jsonc` structure. The deploy command changes from `wrangler pages deploy` to `wrangler deploy`.
2. **Free-tier 10ms CPU limit is a real constraint for the AI generation route.** OpenRouter calls are I/O-bound (don't count toward CPU), but parsing a large flashcard JSON response and writing to Supabase synchronously afterward can push CPU time past the limit on heavy inputs.
3. **The SRS library may be CJS-only.** The Workers runtime (`workerd`) does not support CommonJS. A popular SRS library (e.g., `ts-fsrs`, `fsrs-browser`) must ship ESM or a browser-compatible bundle — verify this before committing to a library.
4. **Supabase latency is not eliminated by edge deployment.** Workers are globally distributed, but every request still round-trips to Supabase's PostgreSQL in one AWS region. Non-US users get edge compute but origin-pinned database latency.
5. **`nodejs_compat` flag behavior evolves silently.** Cloudflare can expand or change the compatibility surface between deployments without a version bump.

### Pre-Mortem — How This Could Fail

The team deployed 10xCards on Cloudflare Workers. The first month felt frictionless — `wrangler deploy` worked immediately, the free tier absorbed early traffic, and cold starts were sub-5ms. The disaster unfolded in three incidents. First, the chosen SRS library internally required `node:perf_hooks` — available in Node but not yet in the `nodejs_compat` surface at the time. Two days were lost debugging a runtime error that only appeared in production (local `astro dev` uses Node.js, not `workerd`). Second, the AI generation route started returning CPU-exceeded errors on inputs longer than 3,000 words: OpenRouter call was fine, but the JSON parsing and batch Supabase write pushed CPU time over the free-tier limit. The fix — streaming responses with chunked writes — required a week of rearchitecting. Third, a Cloudflare `nodejs_compat` update changed the behavior of a `node:crypto` call used in Supabase JWT verification, causing intermittent auth failures for 12 hours. The assumptions that proved wrong: (a) "local dev mirrors production exactly" — it does better than before but `workerd` and Node.js still diverge on edge cases; (b) "I/O-bound means no CPU pressure" — the synchronous work before and after I/O still counts.

### Unknown Unknowns

1. **The scaffold's `wrangler.jsonc` may still target Pages.** Check whether it contains `pages_build_output_dir` or a `[site]` block — those indicate Pages config. Workers config uses `main` pointing to the entry point. Verify before the first deploy.
2. **Preview deployments on Workers don't inherit production secrets.** Unlike Pages preview branches, Workers `[env.preview]` blocks require explicit secret configuration via `wrangler secret put --env preview`. Environment variable management is more verbose than on Netlify/Vercel.
3. **The 10ms CPU limit is per-request, not per-function.** A dashboard page that server-renders multiple components with multiple async data fetches accumulates CPU time across the entire render tree.
4. **Supabase + Workers auth requires `@supabase/ssr` cookies middleware in Workers-compatible mode.** Using `getSession()` in middleware (not `getUser()`) is the documented pattern; bypassing this can cause silent auth regressions when Supabase changes token validation behavior.

## Operational Story

- **Preview deploys**: Every branch pushed to the connected GitHub repo creates a preview Worker deployment at a `*.workers.dev` subdomain. Preview Workers do **not** automatically inherit production secrets — configure `[env.preview]` in `wrangler.jsonc` with the preview-appropriate values, or use `wrangler secret put KEY --env preview` for sensitive values. Fork PRs from external contributors do not trigger preview deployments by default (Cloudflare requires branch access).
- **Secrets**: Environment variables for Workers live in two places: non-sensitive values go in `wrangler.jsonc` under `[vars]`; sensitive values (Supabase service role key, OpenRouter API key) go in Cloudflare's encrypted secrets store via `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`. Secrets are visible to the Worker at runtime via `env.SUPABASE_SERVICE_ROLE_KEY` (not `process.env`). Rotation: `wrangler secret put KEY` overwrites the value; the new Worker deployment picks it up within seconds.
- **Rollback**: `wrangler rollback` reverts to the immediately previous deployment in under 30 seconds. For older versions, use `wrangler deployments list` to find the deployment ID, then `wrangler rollback <deployment-id>`. DB migrations (Supabase) are independent and do not roll back automatically — always apply backwards-compatible migrations before deploying code changes.
- **Approval**: All production deploys (`wrangler deploy`) may be run by an agent unattended. Destructive operations — rotating the Supabase service role key, changing `wrangler.jsonc` routes that affect production traffic, modifying Workers zone-level firewall rules — are human-only steps performed in the Cloudflare dashboard or with explicit confirmation. An agent should not run `wrangler delete` unattended.
- **Logs**: `wrangler tail` streams live request logs to the terminal (real-time, read-only). Filter by status: `wrangler tail --status error`. For historical logs, Cloudflare Workers Logpush (Paid plan) exports to R2 or an external sink; on the free tier, `wrangler tail` is the only log access path.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| `wrangler.jsonc` scaffold targets Pages, not Workers | Unknown unknowns | High | Medium | Before first deploy, check for `pages_build_output_dir` key; if present, migrate to Workers config per adapter v13 docs |
| SRS library ships CJS-only; fails in workerd | Devil's advocate | Medium | High | Before committing to a library, run `node --input-type=module -e "import 'library-name'"` locally, then verify with `wrangler dev`. **Mitigated 2026-10-31 (S-05):** `ts-fsrs@5.4.2` is pure ESM with zero imports; ran in workerd under `wrangler dev` and in production (`/api/reviews/queue`, `/api/reviews`) without runtime errors. CPU time of the review routes not yet recorded — capture with `wrangler tail` on next check. |
| AI route exceeds 10ms CPU limit on free tier | Devil's advocate | Medium | Medium | Upgrade to Paid ($5/mo) for 30ms limit; or stream response parsing; benchmark with inputs >2,000 words before launch. **Measured 2026-10-29 (F-01):** logged-in `POST /api/ai/health` smoke call (tiny prompt, incl. middleware `getUser()`) = 5 ms CPU / 510 ms wall; note `GET /auth/signin` SSR = 22 ms CPU (over 10 ms, outcome ok) — re-measure in S-02 with real prompts + parsing. **Measured 2026-10-31 (S-02, production):** `POST /api/generations` (17 cards, ~3k-char input, Xing4.0 :free) = 13 ms CPU / 17.5 s wall; `POST /api/generations/:id/save` = 18 ms CPU / 178 ms wall; cross-user save 404 = 12 ms CPU; all outcome `ok` despite >10 ms. 10k-char run blocked by free-model 429s (error path = 3–9 ms CPU). Re-check if outcomes turn `exceededCpu`. |
| `nodejs_compat` behavior changes post-deploy | Devil's advocate | Low | Medium | Pin `compatibility_date` in `wrangler.jsonc` and review Cloudflare compat changelog before updating it |
| Preview Workers don't inherit production secrets | Unknown unknowns | High | Low | Add `[env.preview]` block to `wrangler.jsonc` and document the secret-setup flow in the project README |
| Supabase DB latency persists for non-US users | Devil's advocate | Medium | Low | Choose a Supabase region close to the primary user base; accept latency for MVP; add read replicas if needed post-launch |
| AI generation timeout for long inputs | Pre-mortem | Medium | High | Implement streaming with Server-Sent Events (Astro `Response` with readable stream); test with 3,000+ word inputs before launch |

## Getting Started

These commands assume you are in the project root with `wrangler.jsonc` migrated to Workers format (not Pages):

1. **Authenticate with Cloudflare:**
   ```bash
   npx wrangler login
   ```

2. **Verify local dev with the real Workers runtime** (Astro 6 + `@astrojs/cloudflare` v13 runs `workerd` in dev by default):
   ```bash
   npm run dev
   ```

3. **Add secrets for the preview and production environments:**
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_ANON_KEY
   npx wrangler secret put OPENROUTER_API_KEY
   ```

4. **Deploy to production:**
   ```bash
   npx wrangler deploy
   ```

5. **Tail live logs after deploy:**
   ```bash
   npx wrangler tail
   ```

**Before step 4**, confirm `wrangler.jsonc` contains `main` pointing to the Astro Workers entry (e.g., `dist/_worker.js/index.js`) and does **not** contain `pages_build_output_dir` — that key targets the Pages product, not Workers.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions workflow for `wrangler deploy`)
- Production-scale architecture (multi-region HA, Durable Objects, Cloudflare D1 as primary DB)

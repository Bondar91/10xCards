# Cloudflare Workers Integration & Deployment Plan

## Context

The scaffold is already wired for Cloudflare Workers (`wrangler.jsonc` has `main`, no `pages_build_output_dir`, `@astrojs/cloudflare` v13.5.0 adapter, `nodejs_compat` flag). Deployment is handled entirely via **Wrangler CLI + Cloudflare Git integration** — no GitHub Actions. What this plan covers: prerequisites (Wrangler CLI + Supabase), local secrets setup, `wrangler.jsonc` config, runtime secrets, local verification, and Cloudflare Git integration for auto-deploy on push to `main`.

---

## Phase 0 — Prerequisites

### 0a — Wrangler CLI (Cloudflare)

- [ ] Verify Node.js ≥ 22 is active:
  ```bash
  node -v   # should print v22.x.x
  ```
  If not, switch via nvm: `nvm use` (`.nvmrc` pins 22.14.0).

- [ ] Confirm wrangler is available (already a dev dependency — no global install needed):
  ```bash
  npx wrangler --version   # should print wrangler 4.x.x
  ```

- [ ] Authenticate with your Cloudflare account (one-time per machine, opens browser):
  ```bash
  npx wrangler login
  npx wrangler whoami   # confirm: prints account email + account ID
  ```

- [ ] Note your **Account ID** — needed when configuring the Cloudflare dashboard Git integration.

**Edge case — multiple Cloudflare accounts:** `wrangler login` picks the default account. Override per-command with `--account-id <id>` or set `CLOUDFLARE_ACCOUNT_ID` in `.dev.vars`.

**Edge case — auto-deploy auth:** Cloudflare Git integration authenticates via OAuth (set up once in the dashboard). No `CLOUDFLARE_API_TOKEN` or GHA secrets are needed in the repo for auto-deploy to work.

---

### 0b — Supabase project setup

#### Option A — Supabase Cloud (recommended for MVP)

- [ ] Create a free project at [supabase.com](https://supabase.com) if you don't have one. Choose a region close to your primary user base (reduces DB round-trip latency — see `context/foundation/infrastructure.md` risk register).
- [ ] Go to **Project Settings → API** and copy:
  - **Project URL** → this is `SUPABASE_URL`
  - **anon / public** key → this is `SUPABASE_KEY`
  - **Do NOT use the `service_role` key** — it bypasses Row Level Security
- [ ] Keep both values handy — needed in Phase 4 (runtime secrets) and Phase 6 (build-time env vars).

#### Option B — Local Supabase (offline / integration dev only)

- [ ] Ensure Docker is running, then:
  ```bash
  npx supabase start   # prints local API URL + anon key → use in .dev.vars
  npx supabase stop    # when done
  ```
- [ ] Use the local URL/key in `.dev.vars` only. **Never** use a local stack URL as a production secret.

**Edge case — RLS:** All new Supabase tables must have Row Level Security enabled with per-operation, per-role policies (follow the pattern in `supabase/migrations/`). The anon key is silently rejected on tables without RLS policies.

**Edge case — email confirmation:** Supabase Cloud requires email confirmation by default. The signup flow redirects to `/auth/confirm-email` (`src/pages/auth/confirm-email.astro`). You can disable this in **Supabase dashboard → Authentication → Email** for development — leave it enabled in production.

---

## Phase 1 — Local secrets scaffolding
> **Goal:** Give every developer a documented template for the two required secrets.

- [x] Create `.env.example` (for `astro dev` / Vite mode):
  ```
  SUPABASE_URL=https://<your-project-ref>.supabase.co
  SUPABASE_KEY=<your-anon-public-key>
  ```
- [x] Create `.dev.vars.example` (for `wrangler dev` / workerd mode):
  ```
  SUPABASE_URL=https://<your-project-ref>.supabase.co
  SUPABASE_KEY=<your-anon-public-key>
  ```
- [x] Verify `.gitignore` already covers `.dev.vars` and `.env*` — no edit needed if so.

**Edge case:** `astro dev` reads `.env`; `wrangler dev` reads `.dev.vars`. Both files are needed if devs switch between modes. The `.example` files make this explicit.

---

## Phase 2 — Update `wrangler.jsonc`
> **Goal:** Add preview environment stanza and document the vars-vs-secrets contract.

File: `wrangler.jsonc`

- [x] Rename worker `"name"` from `"10x-astro-starter"` → `"10xcards"`.
- [x] Add a `"vars": {}` block with a comment clarifying that secrets go via `wrangler secret put`, never in this file.
- [x] Add an `"env"` block with a `"preview"` stanza:
  ```jsonc
  "env": {
    "preview": {
      "name": "10xcards-preview",
      "vars": {}
      // Secrets for preview must be set separately:
      //   npx wrangler secret put SUPABASE_URL --env preview
      //   npx wrangler secret put SUPABASE_KEY --env preview
    }
  }
  ```

**Edge case — JSONC syntax:** The `[env]` key in JSONC is a nested JSON object, not TOML bracket notation. The `$schema` reference at the top of the file validates this.

**Edge case — preview secrets don't inherit from production:** Cloudflare Worker secrets are scoped to their binding. `wrangler secret put KEY` only affects production; `--env preview` must be run separately.

---

## Phase 3 — ~~GitHub Actions CI workflow~~
> **N/A — deployment is handled entirely by Cloudflare Git integration (Phase 6). No GHA workflow.**

---

## Phase 4 — Set Cloudflare secrets
> **Goal:** Inject `SUPABASE_URL` and `SUPABASE_KEY` into the Workers secret store. Never in any config file.

- [ ] Authenticate wrangler (one-time per machine):
  ```bash
  npx wrangler login
  ```
- [ ] Set production secrets (wrangler prompts for value, not echoed):
  ```bash
  npx wrangler secret put SUPABASE_URL
  npx wrangler secret put SUPABASE_KEY
  ```
- [ ] Verify registration (values are not shown):
  ```bash
  npx wrangler secret list
  ```
  Expected: JSON array with both `SUPABASE_URL` and `SUPABASE_KEY`.
- [ ] Set preview secrets:
  ```bash
  npx wrangler secret put SUPABASE_URL --env preview
  npx wrangler secret put SUPABASE_KEY --env preview
  ```

**Edge case — first deploy vs. secrets:** If `wrangler secret put` errors about a missing worker, run the first `wrangler deploy` first (the worker boots without secrets due to `optional: true`), then set secrets.

**Edge case — key rotation:** Re-running `wrangler secret put` overwrites the value silently. Do a redeploy after rotation to be safe.

---

## Phase 5 — Local dev verification (workerd runtime)
> **Goal:** Confirm the app works under the actual Workers runtime before deploying.

- [ ] Copy and fill example vars:
  ```bash
  cp .dev.vars.example .dev.vars
  # edit .dev.vars with real Supabase values
  ```
- [ ] Run dev server with workerd:
  ```bash
  npx wrangler dev
  ```
- [ ] Verify in browser at `http://localhost:8787`:
  - [ ] Home page loads without errors
  - [ ] `/auth/signin` renders
  - [ ] Sign in with a valid Supabase user → session cookie set → redirect to `/dashboard`
  - [ ] `/dashboard` without session → redirects to `/auth/signin`
  - [ ] Sign out → session cleared

**Edge case — `astro dev` vs `wrangler dev`:** `npm run dev` uses Node.js, not workerd. It will not surface `nodejs_compat` issues. Always use `wrangler dev` for pre-deploy smoke testing.

**Edge case — missing `.dev.vars`:** App boots gracefully (`supabase.ts:6` null-guard returns `null`), but auth won't work. Expected behavior — not a bug.

---

## Phase 6 — Cloudflare Git integration (auto-deploy on push)
> **Goal:** Connect the GitHub repo to Cloudflare so every push to `main` triggers a build + deploy automatically — no GHA deploy step needed.

- [ ] In the Cloudflare dashboard, go to **Workers & Pages → 10xcards → Settings → Build**.
- [ ] Click **Connect to Git** and authorize the GitHub app for this repository.
- [ ] Set the branch to deploy from: `main`.
- [ ] Set the **build command**: `npm run build`
- [ ] Set the **deploy command**: `npx wrangler deploy` (Cloudflare may pre-fill this).
- [ ] Set **Node.js version** to `22` in the environment variables section of the build config.
- [ ] Add build-time environment variables (same as GitHub secrets):
  - `SUPABASE_URL` — your Supabase project URL
  - `SUPABASE_KEY` — anon public key (NOT service role key)
- [ ] Save and trigger a first deploy manually from the dashboard to confirm the pipeline works.
- [ ] Verify the worker URL is live:
  ```
  https://10xcards.<account>.workers.dev
  ```

**Edge case — build env vars vs. runtime secrets:** Cloudflare's build environment is separate from the Worker runtime. `SUPABASE_URL` and `SUPABASE_KEY` must be added in two places: (1) as build-time env vars in the Git integration settings (so `astro build` can resolve `astro:env/server`), and (2) as runtime secrets via `wrangler secret put` (Phase 4) so the deployed Worker can access them at request time. Both are required.

**Edge case — wrangler.jsonc `main` entrypoint:** Cloudflare's Git integration reads `wrangler.jsonc` for Worker config. The `"main": "@astrojs/cloudflare/entrypoints/server"` entry tells Cloudflare where the Worker entry point is after build. No additional config is needed in the dashboard for this.

**Edge case — first deploy vs. secrets ordering:** Set runtime secrets (Phase 4) before triggering the first Git integration deploy. If secrets are missing at first deploy, the Worker will boot but Supabase will be disabled. Set secrets then redeploy from the dashboard.

---

## Phase 7 — Post-deploy verification & operations
> **Goal:** Confirm the live deployment is healthy and document rollback / log procedures.

### Smoke tests
- [ ] `https://10xcards.<account>.workers.dev/` — home page loads
- [ ] `/auth/signin` — form renders, no console errors
- [ ] Sign in with valid user → redirect to `/dashboard`
- [ ] `/dashboard` without session → redirect to `/auth/signin`
- [ ] Sign out → session cleared

### Live logs
```bash
npx wrangler tail 10xcards
npx wrangler tail 10xcards-preview --env preview  # for preview env
```
Cloudflare Observability dashboard (Workers → Logs) is also enabled via `"observability": { "enabled": true }` in `wrangler.jsonc`.

### Rollback
```bash
npx wrangler rollback                     # rolls back to previous version
npx wrangler deployments list             # find a specific version ID
npx wrangler rollback <version-id>        # roll back to specific version
```
Cloudflare retains up to 10 previous versions. DB migrations (Supabase) are independent — rollback only affects the Worker code.

### Missing secrets diagnosis
If auth is silently broken on production:
```bash
npx wrangler secret list       # confirm secrets are registered
npx wrangler tail 10xcards     # look for undefined var errors
```
Then re-run Phase 4.

---

## Files to create / modify

| File | Action |
|---|---|
| `.env.example` | **Create** |
| `.dev.vars.example` | **Create** |
| `wrangler.jsonc` | **Edit** — rename worker, add `vars` + `env.preview` |
| `.github/workflows/ci.yml` | ~~**Create**~~ — not used, Cloudflare handles CI/CD |

## Files to leave unchanged

| File | Why |
|---|---|
| `astro.config.mjs` | `optional: true` on env fields is intentional graceful degradation |
| `src/lib/supabase.ts` | Null-guard on line 6 is the runtime enforcement; do not change |
| `src/middleware.ts` | Already uses `getUser()` (not `getSession()`) — correct Supabase SSR pattern |

## Verification

End-to-end success = all Phase 7 smoke test checkboxes pass with `wrangler tail` showing no errors.

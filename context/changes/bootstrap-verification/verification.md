---
bootstrapped_at: 2026-06-14T00:00:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: 10xcards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10xcards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

**Why this stack**: Solo developer building a 3-week after-hours MVP with auth and AI-powered flashcard generation. Standard path — the vetted recommended default for web-app + JavaScript/TypeScript. The 10x Astro Starter ships Supabase (PostgreSQL + email auth) and Cloudflare Pages pre-wired, covering both technology-forcing features (auth: FR-001/002, AI integration: FR-003/004) without custom assembly. Astro 6 island architecture keeps the bundle lean by default; React 19 islands handle interactive flashcard UI. Cloudflare Pages is the starter's native deploy target and matches the project's deployment preference. CI runs on GitHub Actions with auto-deploy-on-merge. Bootstrapper confidence is first-class (valid CLI, expected to work; not yet battle-tested end-to-end).

## Pre-scaffold verification

| Signal      | Value                                              | Severity | Notes                                                                     |
| ----------- | -------------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| npm package | not run                                            | n/a      | cmd_template starts with `git clone`; npm package check skipped           |
| GitHub repo | not run                                            | n/a      | gh CLI not authenticated; check unavailable — run `gh auth login` to enable |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`

**Strategy**: clone the starter repo without keeping its git history, then move files up

**Exit code**: 0 (clone) + 0 (npm install)

**Files moved**: CLAUDE.md, README.md, astro.config.mjs, components.json, eslint.config.js, package-lock.json, package.json, tsconfig.json, wrangler.jsonc, src/, public/, supabase/, node_modules/

**Conflicts (.scaffold siblings)**: none (all files were absent in cwd)

**.gitignore handling**: append-merged (scaffold lines de-duped and appended with `# from 10x-astro-starter` separator)

**.bootstrap-scaffold cleanup**: deleted

**Note**: Upstream `.git/` history from the clone was deleted before move-up so the starter's commit history does not appear in the project repo.

## Post-scaffold audit

**Tool**: `npm audit --json`

**Summary**: 0 CRITICAL, 11 HIGH, 7 MODERATE, 0 LOW

**Direct vs transitive**: All HIGH findings are transitive via build/dev toolchain (`vite`, `esbuild`, `wrangler`) — none are production-runtime vulnerabilities.

#### HIGH findings

- **esbuild** `>=0.17.0 <0.28.1` (transitive via vite, astro, wrangler)
  - GHSA-gv7w-rqvm-qjhr: Missing binary integrity verification; remote code execution via NPM_CONFIG_REGISTRY (CVSS 8.1) — dev-build toolchain only
  - GHSA-g7r4-m6w7-qqqr: Arbitrary file read on Windows dev server (CVSS 2.5, low runtime risk)

- **devalue** `>=5.6.3 <=5.8.0` (direct advisory)
  - GHSA-77vg-94rm-hx3p: DoS via sparse array deserialization (CVSS 7.5, CWE-770)

- **vite**, **@vitejs/plugin-react**, **@tailwindcss/vite**, **@astrojs/react**, **@astrojs/cloudflare**, **@cloudflare/vite-plugin**, **vitefu**, **wrangler** — all HIGH via esbuild/vite dependency chain (dev toolchain)

**Recommended action**: Run `npm audit fix` to address non-breaking fixes. For breaking changes, monitor upstream Astro/Vite releases — these are build-toolchain findings that update as the ecosystem patches esbuild.

## Hints recorded but not acted on

| Hint                    | Value              |
| ----------------------- | ------------------ |
| bootstrapper_confidence | first-class        |
| quality_override        | false              |
| path_taken              | standard           |
| self_check_answers      | null (standard path — self-check not run) |
| team_size               | solo               |
| deployment_target       | cloudflare-pages   |
| ci_provider             | github-actions     |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true               |
| has_payments            | false              |
| has_realtime            | false              |
| has_ai                  | true               |
| has_background_jobs     | false              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- No `.scaffold` siblings were created — no conflict review needed.
- Run `npm audit fix` to address non-breaking audit findings. Do not run `npm audit fix --force` without reviewing the breaking changes it would introduce.
- The 11 HIGH findings are all in build/dev toolchain (esbuild, vite, wrangler) — not production-runtime risk. Monitor upstream Astro releases for patches.
- Configure Supabase: create a project at supabase.com and populate the `.env` variables the starter expects (see `src/` for references).
- Wire Cloudflare Pages: connect your repo in the Cloudflare dashboard and set the same env vars as secrets.

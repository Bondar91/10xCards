---
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
---

## Why this stack

Solo developer building a 3-week after-hours MVP with auth and AI-powered flashcard generation. Standard path — the vetted recommended default for web-app + JavaScript/TypeScript. The 10x Astro Starter ships Supabase (PostgreSQL + email auth) and Cloudflare Pages pre-wired, covering both technology-forcing features (auth: FR-001/002, AI integration: FR-003/004) without custom assembly. Astro 6 island architecture keeps the bundle lean by default; React 19 islands handle interactive flashcard UI. Cloudflare Pages is the starter's native deploy target and matches the project's deployment preference. CI runs on GitHub Actions with auto-deploy-on-merge. Bootstrapper confidence is first-class (valid CLI, expected to work; not yet battle-tested end-to-end). Standard path skips the team profile and tech preferences questions — the recommended default is already weighted toward solo developers with a short timeline.

---
change_id: account-access-production
title: Account access production
status: implementing
created: 2026-10-29
updated: 2026-10-29
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

## Evidence

- **Phase 1 (wrangler dev, 2026-10-29)**: default-deny middleware, `next` round-trip, 401 JSON for anonymous API, unsafe `next` (`//evil.com`, `https://evil.com`, `/\evil.com`, `/\t/evil.com`, `javascript:`) → `/dashboard`; confirmed by user. Commit `4d6dabf`.
- **Phase 2 (wrangler dev, 2026-10-29)**: `/auth/confirm` without params → `reason=expired`; all reason states in Polish; resend → `resent`; local sign-up (confirmations off) → `/dashboard`; confirmed by user. Commit `f23dd51`.
- **Phase 3 (production, 2026-10-29)**: https://10xcards.krystian-bondaruk.workers.dev — deployed via Cloudflare Git integration (push of `f23dd51`). Anonymous `GET /dashboard` → 302 `/auth/signin?next=%2Fdashboard`; `GET /auth/confirm` (no params) → 302 `/auth/confirm-email?reason=expired`. Supabase URL config, "Confirm email" ON and Polish `token_hash` template set; cross-device confirmation, unconfirmed/expired states with resend, sign-in/sign-out and `next` return confirmed by user.
- **CPU (`wrangler tail --format json`, 3 anonymous runs each, all outcome `ok`, 0 exceptions):**
  - `GET /dashboard` (anon → 302): cpuTime **8 / 2 / 1 ms** (wall 10 / 2 / 1 ms) — first is cold.
  - `POST /api/auth/signin` (wrong password → Polish error redirect): cpuTime **31 / 4 / 7 ms** (wall 379 / 61 / 71 ms) — first is cold start, above the 10 ms free-tier budget; warm runs within it.
  - Not measured here: signed-in `GET /dashboard` SSR (F-01 saw 22 ms for `GET /auth/signin` SSR). Feed into S-02 CPU planning.

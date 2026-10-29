# Account Access on Production — Plan Brief

> Full plan: `context/changes/account-access-production/plan.md`

## What & Why

Roadmap S-01 (FR-001, FR-002): a user can sign up, confirm the email, sign in, land in their own area and sign out on the deployed app, and an anonymous visitor cannot reach any flashcard page. S-02 needs a logged-in user to save flashcards for, and every future page should be protected by default.

## Starting Point

Supabase SSR auth with cookie sessions, sign-in/up/out endpoints and forms already exist and work locally. On production the emailed confirmation link has no landing route, sign-in lands on `/`, protection is a one-entry deny-list (`/dashboard`), inputs are unvalidated, and raw English Supabase errors reach the UI.

## Desired End State

On production, the confirmation link works on any device and signs the user in. Sign-in returns to the page that required it (or `/dashboard`). Everything outside `/`, `/auth/*`, `/api/auth/*` requires a session. Unconfirmed and expired-link cases have a Polish explanation and a "send again" option. All auth UI is in Polish.

## Key Decisions Made

| Decision            | Choice                                                    | Why (1 sentence)                                                        |
| ------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Confirmation flow   | `token_hash` + `verifyOtp` at `/auth/confirm`             | Works cross-device, unlike PKCE `?code=` which needs the original browser's cookie. |
| Post-login target   | `?next=` (validated local path), fallback `/dashboard`    | Users return where they were headed; validation blocks open redirects.  |
| Route protection    | Default-deny with public allowlist                        | New flashcard pages in S-02..S-05 are protected without extra wiring.   |
| Edge cases          | One state page (sent / unconfirmed / expired / resent) + resend | A user is never stuck without a way forward.                      |
| Email delivery      | Built-in Supabase SMTP, risk documented                   | Fits the `speed` goal; custom SMTP is a separate pre-launch change.     |
| UI language         | Polish                                                    | Consistent with F-01 messages and the target persona.                   |
| Signed-in on auth pages | Redirect to `/dashboard`                              | No confusing second login while a session exists.                       |
| Verification        | Lint + build + manual smoke (wrangler dev, production)    | Same as F-01; no test runner exists.                                     |

## Scope

**In scope:** default-deny middleware (401 JSON for API), `safeNext` helper, zod validation + Polish error mapping in auth endpoints, `/auth/confirm`, resend endpoint, confirm-email state page, Polish copy, Supabase production URL/template config, production smoke checklist with CPU evidence.

**Out of scope:** custom SMTP, password reset, OAuth, account deletion, preview-env auth, CPU optimization, test framework, CI workflow, landing page content.

## Architecture / Approach

Middleware decides access (public allowlist → else session required; API → 401, page → redirect with `next`). Endpoints validate with `astro/zod`, call Supabase, and redirect with Polish messages from one error map. Email link → `/auth/confirm` → `verifyOtp` sets the cookie session on the opening device → `/dashboard`. Failures funnel into `/auth/confirm-email?reason=…` with a resend form.

## Phases at a Glance

| Phase                                   | What it delivers                                                   | Key risk                                           |
| --------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| 1. Route protection and redirects       | Default-deny middleware, `next`, validated endpoints, Polish errors | Allowlist misses a public path (e.g. a static route) |
| 2. Email confirmation flow + Polish UI  | `/auth/confirm`, resend, state page, translated screens            | Token type mismatch (`email` vs `signup`)           |
| 3. Production config and smoke tests    | Supabase settings, template switch, E2E evidence on production      | Template switched before deploy → 404 links         |

**Prerequisites:** access to the Supabase production dashboard; working `wrangler` auth for `tail`; a second device/browser and a fresh email address for the test.
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- Built-in Supabase SMTP sends only a few emails per hour — fine for the smoke test, not for a public launch.
- Mail-scanner link prefetching can consume the one-time token; the expired page + resend is the recovery.
- SSR CPU on auth pages measured 22 ms in F-01 (budget 10 ms, outcome ok) — measured again here, not fixed.

## Success Criteria (Summary)

- A new user completes sign-up → email confirmation on another device → `/dashboard` on production.
- Anonymous access to anything outside the public allowlist is blocked (redirect or 401).
- No raw/English Supabase error text appears in the auth UI.

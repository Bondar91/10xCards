# Account Access on Production Implementation Plan

## Overview

Roadmap item **S-01** (issue #2). Close the account flow end-to-end on the deployed Worker: a user can sign up (email + password), confirm the email from any device, sign in, land in their own area, and sign out; an anonymous visitor cannot reach any page or API outside a small public allowlist. The auth mechanism already exists (Supabase SSR, cookie sessions); this change fills the gaps that only show up on production (email confirmation, redirects, default-deny protection) so S-02 has a logged-in user to save flashcards for.

## Current State Analysis

- **No confirmation landing route.** Signup calls `supabase.auth.signUp` and redirects to `/auth/confirm-email` (`src/pages/api/auth/signup.ts:13-19`), but nothing exchanges the emailed link for a session. Local Supabase has `enable_confirmations = false` (`supabase/config.toml:209`), and `src/pages/auth/confirm-email.astro:4` fakes a "registration successful" state under `import.meta.env.DEV`, so the gap is invisible locally.
- **Sign-in lands on `/`**, not the user's area (`src/pages/api/auth/signin.ts:20`). The deployment-plan smoke test (Phase 7, `context/changes/deployment/deployment-plan.md:231`) expects `/dashboard`.
- **Deny-list protection.** `PROTECTED_ROUTES = ["/dashboard"]` matched with `startsWith` (`src/middleware.ts:4,18`). Every future flashcard page or API is public unless someone remembers to add it; `startsWith("/dashboard")` also matches `/dashboardx`.
- **No input validation.** Auth endpoints cast `form.get(...) as string` and forward raw Supabase `error.message` (English) via `?error=` (`signin.ts:6-17`, `signup.ts:6-17`). CLAUDE.md requires zod.
- **UI language mismatch.** Auth screens and form validation are English (`SignInForm.tsx`, `SignUpForm.tsx`, `Layout.astro:14` `lang="en"`); F-01 errors are Polish (`src/pages/api/ai/health.ts:30,37-39`).
- **CPU signal from F-01:** `GET /auth/signin` SSR measured 22 ms CPU on production (F-01 change.md Evidence) against the 10 ms free-tier budget; outcome was `ok`.
- Middleware already resolves `context.locals.user` via `getUser()` on every request (`src/middleware.ts:7-15`) — keep that (infrastructure.md item 4 prefers server-validated user).

## Desired End State

On `https://10xcards.krystian-bondaruk.workers.dev`:

- Sign-up → "check your email" page → the email link opened **on any device/browser** confirms the account, creates a session there, and lands on `/dashboard`.
- Sign-in → `next` target (if a protected page triggered the login) or `/dashboard`. Sign-out clears the session and lands on `/`.
- Anonymous request to any non-public page → 302 to `/auth/signin?next=<path>`; to any non-public API → 401 JSON. Public: `/`, `/auth/*`, `/api/auth/*`.
- Signed-in visit to `/auth/signin`, `/auth/signup`, `/auth/confirm-email` → 302 to `/dashboard`.
- Sign-in before confirmation, or an expired/used link, lands on a page that explains the state in Polish and offers "send the link again".
- All auth screens and messages are in Polish; no raw Supabase error text reaches the UI.

Verification: the Phase 3 production checklist passes, and `wrangler tail` shows no errors and records CPU time for sign-in and `/dashboard`.

### Key Discoveries:

- Supabase SSR guidance for server-rendered email confirmation: link `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` + `supabase.auth.verifyOtp({ token_hash, type })` on the server. Unlike the PKCE `?code=` flow it needs no `code_verifier` cookie, so it works cross-device.
- `supabase.auth.resend({ type: "signup", email })` re-sends the confirmation email; it is subject to the email send rate limit (`over_email_send_rate_limit`).
- Supabase `AuthError.code` values to map: `invalid_credentials`, `email_not_confirmed`, `user_already_exists`, `weak_password`, `email_address_invalid`, `over_email_send_rate_limit`, `over_request_rate_limit`, `otp_expired`; anything else → generic message.
- With confirmations on, `signUp` for an already-registered email returns no error (anti-enumeration); with confirmations off (local), it returns a `session`.
- zod is available without a new dependency via `astro/zod`.
- Error-shape pattern for JSON 401: `{ ok: false, error: "Wymagane logowanie." }` (`src/pages/api/ai/health.ts:30`).
- `npm run lint` fails on HEAD with pre-existing errors in untouched files (F-01 Evidence 1.1) — lint changed files with `npx eslint <files>`.

## What We're NOT Doing

- No custom SMTP — the built-in Supabase mailer stays; its low hourly limit is an Open Risk (separate change before a public launch).
- No password reset / change password, no OAuth providers, no account deletion.
- No `next` round-trip through sign-up/email confirmation — after confirming, the user always lands on `/dashboard`.
- No preview-environment auth setup (Site URL points at production only).
- No CPU optimization of SSR pages — only measurement and recording.
- No unit-test framework (repo has none; verification is lint/build + manual smoke, as in F-01).
- No CI workflow (`.github/workflows/` absent; separate concern).
- No changes to the landing page content (`Welcome.astro`) beyond what Topbar shows.
- No signup enumeration hardening beyond Supabase's default behaviour.

## Implementation Approach

Server-first: make the access rules correct (default-deny middleware, safe `next`, validated endpoints, Polish error mapping) in Phase 1 so that every later route inherits protection. Phase 2 adds the confirmation landing route and the "unconfirmed / expired / resend" state on a single page, plus the Polish copy. Phase 3 is configuration and evidence: Supabase dashboard settings, the email template switch, and the full production checklist.

## Critical Implementation Details

- **Open redirect:** `next` must be a same-origin path: starts with a single `/`, not `//` and not `/\`, no scheme. Anything else falls back to `/dashboard`. Apply the same helper wherever `next` is read.
- **Rollout order:** switch the Supabase "Confirm signup" email template to the `/auth/confirm?token_hash=…` link only **after** the deploy containing `/auth/confirm` is live; otherwise new sign-ups get a 404 link. Links sent with the old template still confirm the account on Supabase's side.
- **Email link prefetchers** (corporate mail scanners) may consume the one-time token; the expired-link page with resend is the recovery path.

## Phase 1: Route protection and redirects

### Overview

Default-deny middleware, safe post-login redirect, validated auth endpoints with Polish error messages.

### Changes Required:

#### 1. Access rules

**File**: `src/middleware.ts`

**Intent**: Replace the protected-route list with a public allowlist; redirect anonymous page requests to sign-in with `next`, answer anonymous API requests with 401 JSON, and bounce signed-in users away from the sign-in/sign-up/confirm-email pages.

**Contract**: Public = exact `/`, prefix `/auth/`, prefix `/api/auth/` (segment-aware matching, not bare `startsWith`). Anonymous + non-public + path under `/api/` → `401 {"ok":false,"error":"Wymagane logowanie."}`; otherwise → `302 /auth/signin?next=<encodeURIComponent(pathname+search)>`. Signed-in + path in `{/auth/signin, /auth/signup, /auth/confirm-email}` → `302 /dashboard`. `/auth/confirm` is never redirected by this rule.

#### 2. Redirect helper

**File**: `src/lib/auth-redirect.ts` (new)

**Intent**: One place that turns an untrusted `next` value into a safe local path.

**Contract**: `export function safeNext(raw: string | null | undefined): string` — returns `raw` only if it is a same-origin path (see Critical Implementation Details), else `"/dashboard"`.

#### 3. Error mapping

**File**: `src/lib/auth-errors.ts` (new)

**Intent**: Map Supabase auth errors to Polish user-facing messages so raw provider text never reaches the UI.

**Contract**: `export function authErrorMessage(error: { code?: string } | null | undefined): string` — covers the codes in Key Discoveries, default `"Coś poszło nie tak. Spróbuj ponownie."`.

#### 4. Sign-in endpoint

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Validate input with zod, map errors, preserve `next` across error redirects, and land on `safeNext(next)` on success. `email_not_confirmed` is handled in Phase 2.

**Contract**: Form fields `email`, `password`, optional `next`. Validation failure or auth error → `302 /auth/signin?error=<pl message>&next=<next>`. Success → `302 safeNext(next)`. Add `export const prerender = false`.

#### 5. Sign-up and sign-out endpoints

**File**: `src/pages/api/auth/signup.ts`, `src/pages/api/auth/signout.ts`

**Intent**: Validate sign-up input with zod (email, password ≥ 6 chars — matches `MIN_PASSWORD_LENGTH` in `SignUpForm.tsx:8`), map errors; if `signUp` returns a session (confirmations off), go straight to `/dashboard`, else to `/auth/confirm-email`. Sign-out unchanged in behaviour.

**Contract**: Sign-up: invalid / error → `302 /auth/signup?error=<pl message>`; `data.session` → `302 /dashboard`; otherwise `302 /auth/confirm-email`. Both files export `prerender = false`.

#### 6. Pass `next` through the sign-in page

**File**: `src/pages/auth/signin.astro`, `src/components/auth/SignInForm.tsx`

**Intent**: Read `next` from the query and post it back as a hidden field.

**Contract**: `SignInForm` gains optional prop `next?: string | null`, rendered as `<input type="hidden" name="next">` when present.

### Success Criteria:

#### Automated Verification:

- Changed files lint clean: `npx eslint src/middleware.ts src/lib/auth-redirect.ts src/lib/auth-errors.ts src/pages/api/auth src/pages/auth src/components/auth`
- Production build passes: `npm run build`

#### Manual Verification:

- wrangler dev: anonymous `GET /dashboard` → 302 to `/auth/signin?next=%2Fdashboard`; after sign-in lands on `/dashboard`
- wrangler dev: anonymous `POST /api/ai/health` (with `Content-Type: application/json`) → 401 JSON from middleware
- wrangler dev: `next=//evil.com` and `next=https://evil.com` fall back to `/dashboard`
- wrangler dev: signed-in `GET /auth/signin` → 302 `/dashboard`; wrong password shows a Polish message

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Email confirmation flow and Polish UI

### Overview

Confirmation landing route, one page for "sent / unconfirmed / expired" states with resend, and Polish copy across auth screens.

### Changes Required:

#### 1. Confirmation landing route

**File**: `src/pages/auth/confirm.ts` (new)

**Intent**: Turn the emailed `token_hash` into a session on whatever device opened the link.

**Contract**: `GET /auth/confirm?token_hash=<h>&type=<email|signup>`. Calls `supabase.auth.verifyOtp({ token_hash, type })`. Success → `302 /dashboard`. Missing params or error → `302 /auth/confirm-email?reason=expired`. `prerender = false`.

#### 2. Resend endpoint

**File**: `src/pages/api/auth/resend.ts` (new)

**Intent**: Re-send the confirmation email without revealing whether the address exists.

**Contract**: `POST` form field `email` (zod). Calls `supabase.auth.resend({ type: "signup", email })`. Rate-limit error → `302 /auth/confirm-email?reason=<current>&error=<pl message>`; any other outcome → `302 /auth/confirm-email?reason=resent`. `prerender = false`.

#### 3. Unconfirmed sign-in

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Route `email_not_confirmed` to the state page instead of a generic error.

**Contract**: `error.code === "email_not_confirmed"` → `302 /auth/confirm-email?reason=unconfirmed`.

#### 4. State page

**File**: `src/pages/auth/confirm-email.astro`, `src/components/auth/ResendConfirmationForm.tsx` (new)

**Intent**: One page with Polish copy per `reason` — default `sent` ("sprawdź skrzynkę"), `unconfirmed`, `expired`, `resent` — each with the resend form (email field) and a link back to sign-in. Drop the `import.meta.env.DEV` fake-success branch (sign-up now redirects to `/dashboard` when a session exists).

**Contract**: Query `reason ∈ {sent, unconfirmed, expired, resent}` (unknown → `sent`), optional `error`. Form posts to `/api/auth/resend`, reuses `FormField`, `SubmitButton`, `ServerError`.

#### 5. Polish copy

**File**: `src/layouts/Layout.astro`, `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/dashboard.astro`, `src/components/Topbar.astro`, `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/PasswordToggle.tsx`

**Intent**: Translate titles, labels, placeholders, client-side validation messages and buttons to Polish; set `lang="pl"`.

**Contract**: No behaviour change; English strings removed from these files.

### Success Criteria:

#### Automated Verification:

- Changed files lint clean: `npx eslint src/pages src/components src/layouts`
- Production build passes: `npm run build`

#### Manual Verification:

- wrangler dev: `/auth/confirm` without params → `/auth/confirm-email?reason=expired` with resend form
- wrangler dev: each `reason` variant renders Polish copy; resend form submits and shows the `resent` state
- wrangler dev: sign-up (confirmations off locally) lands on `/dashboard`
- Auth screens, Topbar and dashboard show no English UI strings

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Production configuration and smoke tests

### Overview

Configure Supabase for production, switch the email template after deploy, run the end-to-end checklist on production, record evidence.

### Changes Required:

#### 1. Supabase dashboard (human, production project)

**Intent**: Point auth at the production URL and enable cross-device confirmation.

**Contract**:
- Authentication → URL Configuration: Site URL = `https://10xcards.krystian-bondaruk.workers.dev`; Redirect URLs include `https://10xcards.krystian-bondaruk.workers.dev/**`.
- Authentication → Providers → Email: "Confirm email" ON; minimum password length 6.
- Authentication → Email Templates → Confirm signup (only after the Phase 2 deploy is live): link `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`; subject and body in Polish.

#### 2. Evidence and docs

**File**: `context/changes/account-access-production/change.md`, `context/changes/deployment/deployment-plan.md`

**Intent**: Record production results (dates, CPU times from `wrangler tail` for `POST /api/auth/signin` and `GET /dashboard`) in change.md `## Evidence`; tick the Phase 7 smoke-test checkboxes in deployment-plan.

**Contract**: change.md gains `## Evidence`; deployment-plan Phase 7 "Smoke tests" items checked.

### Success Criteria:

#### Automated Verification:

- Production build passes: `npm run build`
- Production responds: `curl -s -o /dev/null -w '%{http_code}' https://10xcards.krystian-bondaruk.workers.dev/dashboard` returns `302`

#### Manual Verification:

- Supabase Site URL, redirect URLs, "Confirm email" and Polish template set as specified
- Production: sign up with a fresh address → Polish email arrives → link opened on a different device/browser lands on `/dashboard` signed in
- Production: sign-in before confirming → `unconfirmed` page; resend delivers a new link
- Production: reusing a consumed link → `expired` page
- Production: sign-in → `/dashboard`; sign-out → `/` and `/dashboard` redirects to sign-in again
- Production: anonymous `/dashboard` → sign-in with `next`, after login back on `/dashboard`
- `wrangler tail`: no errors during the checklist; CPU times recorded in change.md Evidence

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None (no test runner in repo). `safeNext` and the allowlist matcher are pure functions kept small enough to verify by the manual cases above.

### Integration Tests:

- Covered manually: wrangler dev in Phases 1–2, production in Phase 3.

### Manual Testing Steps:

1. Anonymous `/dashboard` → sign-in with `next` → back on `/dashboard`.
2. `next` values `//evil.com`, `https://evil.com`, `/\evil.com` → `/dashboard`.
3. Sign-up on production, open the link on a second device → signed in on `/dashboard`.
4. Sign-in before confirming → `unconfirmed` + resend; reused link → `expired`.
5. Sign-out → `/`, protected pages redirect again.

## Performance Considerations

No new per-request work beyond what middleware already does (`getUser()`). Record CPU for sign-in and `/dashboard` on production; F-01 saw 22 ms on `GET /auth/signin`, above the 10 ms free-tier budget but with `ok` outcome. Optimization is out of scope; the numbers feed S-02 planning.

## Migration Notes

No database changes. Existing production accounts (if any were created with the old link) stay valid. Rollback: `npx wrangler rollback` for the Worker; revert the email template in the Supabase dashboard by hand.

## References

- Roadmap: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (FR-001, FR-002, access model)
- Deployment smoke tests: `context/changes/deployment/deployment-plan.md:225-256`
- CPU evidence: `context/changes/ai-provider-gateway/change.md` (Evidence, Phase 3)
- JSON error shape: `src/pages/api/ai/health.ts:28-31`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Route protection and redirects

#### Automated

- [x] 1.1 Changed files lint clean — 4d6dabf
- [x] 1.2 Production build passes: `npm run build` — 4d6dabf

#### Manual

- [x] 1.3 wrangler dev: anonymous /dashboard redirects with next and returns after sign-in — 4d6dabf
- [x] 1.4 wrangler dev: anonymous API request returns 401 JSON from middleware — 4d6dabf
- [x] 1.5 wrangler dev: unsafe next values fall back to /dashboard — 4d6dabf
- [x] 1.6 wrangler dev: signed-in /auth/signin redirects; wrong password shows Polish message — 4d6dabf

### Phase 2: Email confirmation flow and Polish UI

#### Automated

- [x] 2.1 Changed files lint clean
- [x] 2.2 Production build passes: `npm run build`

#### Manual

- [x] 2.3 wrangler dev: /auth/confirm without params lands on expired state
- [x] 2.4 wrangler dev: all reason variants render Polish copy; resend shows resent state
- [x] 2.5 wrangler dev: sign-up with confirmations off lands on /dashboard
- [x] 2.6 No English UI strings on auth screens, Topbar and dashboard

### Phase 3: Production configuration and smoke tests

#### Automated

- [ ] 3.1 Production build passes: `npm run build`
- [ ] 3.2 Production /dashboard returns 302 for anonymous curl

#### Manual

- [ ] 3.3 Supabase URL config, confirm-email setting and Polish template set
- [ ] 3.4 Production: cross-device email confirmation lands signed in on /dashboard
- [ ] 3.5 Production: unconfirmed sign-in shows state page and resend delivers a link
- [ ] 3.6 Production: reused link shows expired state
- [ ] 3.7 Production: sign-in to /dashboard and sign-out to / with protection restored
- [ ] 3.8 Production: anonymous /dashboard returns to /dashboard after login via next
- [ ] 3.9 wrangler tail clean; CPU times recorded in change.md Evidence

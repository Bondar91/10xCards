<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Account Access on Production

- **Plan**: context/changes/account-access-production/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-10-31
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Evidence

- Every planned file appears in the diff `0771421..825affb`, and no planned file is missing. The only unplanned edit is in a planned file: see F1.
- Contracts checked against the code and found to match:
  - Default-deny allowlist with segment-aware matching.
  - Anonymous API requests get a 401 JSON response with the same shape as `health.ts`.
  - Signed-in users are bounced from guest-only routes, and `/auth/confirm` is excluded from that bounce.
  - `safeNext` rejects `//`, backslashes, whitespace and control characters, and URLs with a scheme.
  - zod validation is used on signin, signup, resend and confirm.
  - Errors are mapped to Polish messages, so no Supabase `error.message` reaches the UI.
  - `email_not_confirmed` leads to the `unconfirmed` state.
  - `verifyOtp` uses the token_hash flow.
  - Resend gives the same response for every outcome except a rate limit, so it does not reveal whether an address exists.
- `npm run build`: PASS.
- `curl https://10xcards.krystian-bondaruk.workers.dev/dashboard`: returned `302`, PASS.
- `npx eslint` on the changed TS/TSX files: clean. On the changed `.astro` files: fails. See F2.

## Findings

### F1 — Unplanned edits to deployment-plan.md (GitHub section, Phases 0–6)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/deployment/deployment-plan.md (commit 2d1e9bc)
- **Detail**: The plan's contract for this file was "deployment-plan Phase 7 'Smoke tests' items checked", and the commit message says the same. The diff (+68/−37) also does three other things: it adds a new section "0b — GitHub repository setup", renames 0b → "0c — Supabase project setup", and ticks checkboxes in the setup phases (0–6). These are benign documentation changes outside this change's scope, and nothing records them.
- **Fix**: Add one line to the Notes in change.md saying that 2d1e9bc also updated deployment-plan Phases 0–6 and added the GitHub setup section.
- **Decision**: FIXED — note added to change.md Notes

### F2 — "Changed files lint clean" ticked while .astro files fail ESLint

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 1.1 / 2.1; src/pages/auth/*.astro, src/layouts/Layout.astro, src/components/Topbar.astro
- **Detail**: `npx eslint` reports `prettier/prettier` "Parsing error" on every `.astro` file, both the changed ones (confirm-email, signin, signup, dashboard, Topbar, Layout) and untouched ones (index, Banner, Welcome). The same errors existed before this change: the baseline at 0771421 had 56 errors and HEAD has 21. So this is a tooling problem that was already there, not a regression. Even so, 1.1 and 2.1 are ticked as "lint clean" when the lint never actually checked the `.astro` files.
- **Fix A ⭐ Recommended**: Note in change.md that `.astro` files are not linted until the eslint/prettier parser setup for Astro is fixed, and add that fix to the roadmap as a separate small change.
  - Strength: The record matches reality without stretching the scope of this change, and the plan's Key Discoveries already treat pre-existing lint errors as out of scope.
  - Tradeoff: Until the separate change lands, `.astro` files still get no lint feedback.
  - Confidence: HIGH — the baseline comparison shows the errors existed before this change.
  - Blind spot: The root cause of the parse error has not been investigated (it is probably the `prettier/prettier` rule running on `.astro` without `prettier-plugin-astro` loaded in ESLint).
- **Fix B**: Fix the ESLint config now so that `.astro` files parse.
  - Strength: The lint criterion becomes true, and every future change benefits.
  - Tradeoff: Config work outside this change's scope that will probably cause formatting churn in many files.
  - Confidence: MED — the fix itself has not been verified.
  - Blind spot: How many files `--fix` would reformat.
- **Decision**: FIXED via Fix A — note in change.md; config fix queued in follow-ups/review-fixes.md

### F3 — Every verifyOtp error is shown as "expired"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/confirm.ts:31
- **Detail**: When Supabase or the network has an outage (5xx, timeout), the user sees "Link wygasł" and may request a new link that also fails. The plan specifies this behaviour, and it is safe. The cost is lost diagnostics: nothing is logged.
- **Fix**: Before `expired()`, add `console.error("verifyOtp failed", error.code)` when `error.code !== "otp_expired"` so that `wrangler tail` shows real failures.
- **Decision**: FIXED — console.error added in src/pages/auth/confirm.ts (pattern from ai-client.ts)

### F4 — MIN_PASSWORD_LENGTH duplicated in server and client

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/signup.ts:9, src/components/auth/SignUpForm.tsx:8
- **Detail**: The constant is defined twice and kept in sync only by the comment "Matches MIN_PASSWORD_LENGTH in SignUpForm.tsx". A third copy is the Supabase dashboard setting.
- **Fix**: Export `MIN_PASSWORD_LENGTH` from `src/lib/auth-rules.ts` (or `auth-redirect.ts`) and import it in both places.
- **Decision**: FIXED — new src/lib/auth-rules.ts, imported by signup.ts and SignUpForm.tsx

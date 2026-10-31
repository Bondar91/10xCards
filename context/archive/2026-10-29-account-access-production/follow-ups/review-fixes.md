# Review follow-ups: account-access-production

Source: `reviews/impl-review.md` (2026-10-31)

- [ ] **F2 — ESLint cannot parse `.astro` files.** Every `.astro` file fails with `prettier/prettier` "Parsing error", so `.astro` gets no lint feedback. Likely cause (not verified): the `prettier/prettier` rule runs on `.astro` without `prettier-plugin-astro` resolved inside ESLint. Fix the config in a separate small change; expect formatting churn from `--fix`.

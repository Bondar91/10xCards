# Review follow-ups: ai-provider-gateway

Source: `reviews/impl-review.md` (2026-10-31)

- [x] **F1 — Rotate the OpenRouter API key.** The key was pasted into an agent chat during Phase 1. Rotate it in OpenRouter → Keys (revoke the old one), set the new one with `npx wrangler secret put OPENROUTER_API_KEY` (never paste it into a chat), update `.dev.vars`, and record the rotation date in change.md Evidence.
- [ ] **F4 — Retire `POST /api/ai/health` in S-02.** Any confirmed account can call it in a loop and spend AI credits (tiny per call, no throttle). Once S-02's real generation route exists, remove the health route or put it behind the same rate limit. Input for `/10x-plan ai-generation-review`.

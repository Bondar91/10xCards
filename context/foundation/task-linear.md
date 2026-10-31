---
project: "10xCards"
system: linear
workspace: bondar91
team: KRY
source: context/foundation/roadmap.md
mirror_of: context/foundation/task-github.md
roadmap_version: 1
created: 2026-10-27
updated: 2026-10-27
---

# Task Management — Linear mirror of roadmap.md

> `context/foundation/roadmap.md` is the **source of truth** for scope, order and dependencies.
> GitHub Issues (`task-github.md`) is the **canonical execution backlog**.
> Linear is a **secondary mirror** of the same items. When they disagree: fix the roadmap first, then sync GitHub, then Linear.

## Overview

| What      | Where                                                                                  |
| --------- | -------------------------------------------------------------------------------------- |
| System    | Linear (MCP server `linear-server`)                                                    |
| Team      | Krystian (`KRY`)                                                                       |
| Project   | [10xCards](https://linear.app/bondar91/project/10xcards-76d8d0d034d2) (`P-KRY-1`)      |
| Milestone | `MVP (roadmap v1)` — no target date by design                                          |
| Links     | Each Linear issue has a link attachment to its GitHub issue and `**GitHub:** #N` in body |

## Mapping roadmap → Linear

| Roadmap element                      | Linear representation                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| Foundation / Slice (`F-NN` / `S-NN`) | One issue in project 10xCards, milestone MVP; title identical to GitHub         |
| Foundation vs slice                  | Label `type:foundation` / `type:slice` (team labels, same colors as GitHub)     |
| Status `ready` / `proposed`          | Label `status:ready` / `status:proposed` **and** workflow state Todo / Backlog  |
| Stream (A / B)                       | Label `stream:A` / `stream:B`                                                   |
| North star                           | Label `north-star`                                                              |
| Prerequisites                        | "Blocked by: KRY-N" in body **and** native Linear "blocked by" relation         |
| Open Roadmap Question                | Issue `[Q-NN] …`, label `type:question`, "related" relation to affected slices  |
| Parked, Baseline, Vision, North star | **Not mirrored** — live only in roadmap.md                                      |

## Issue index

| Linear | GitHub                                              | Roadmap ID | Change ID                   | State   | Blocked by   | Related |
| ------ | --------------------------------------------------- | ---------- | --------------------------- | ------- | ------------ | ------- |
| KRY-5  | [#1](https://github.com/Bondar91/10xCards/issues/1) | F-01       | `ai-provider-gateway`       | Todo    | —            | —       |
| KRY-6  | [#2](https://github.com/Bondar91/10xCards/issues/2) | S-01       | `account-access-production` | Todo    | —            | —       |
| KRY-7  | [#3](https://github.com/Bondar91/10xCards/issues/3) | Q-01       | —                           | Todo    | —            | KRY-8, KRY-10 |
| KRY-8  | [#4](https://github.com/Bondar91/10xCards/issues/4) | S-02 ⭐    | `ai-generation-review`      | Backlog | KRY-5, KRY-6 | KRY-7   |
| KRY-9  | [#5](https://github.com/Bondar91/10xCards/issues/5) | S-03       | `deck-browse-edit-delete`   | Backlog | KRY-8        | —       |
| KRY-10 | [#6](https://github.com/Bondar91/10xCards/issues/6) | S-04       | `manual-flashcard-create`   | Backlog | KRY-8        | KRY-7   |
| KRY-11 | [#7](https://github.com/Bondar91/10xCards/issues/7) | S-05       | `srs-review-session`        | Backlog | KRY-8        | —       |

Onboarding issues KRY-1..KRY-4 are Linear defaults and not part of the mirror.

## Sync rules

1. **Roadmap first**, then GitHub, then Linear. Never edit scope only in Linear.
2. **Status change** → swap `status:*` label and move state (ready → Todo, proposed → Backlog); mirror the same change on GitHub.
3. **New roadmap item** → create GitHub issue first, then Linear issue in project 10xCards / milestone MVP with the same title, labels, a GitHub link attachment and native "blocked by" relations; add a row above.
4. **Starting work** → move the Linear issue to In Progress; PR uses `Closes #N` (GitHub) and may mention `KRY-N`.
5. **Finishing work** → when the GitHub issue closes, move the Linear issue to Done.
6. **Roadmap v2** → new milestone in project 10xCards; do not reuse completed issues.

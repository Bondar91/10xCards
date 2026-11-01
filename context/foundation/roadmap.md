---
project: "10xCards"
version: 1
status: draft
created: 2026-10-27
updated: 2026-11-01
backlog: https://github.com/Bondar91/10xCards/milestone/1
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: 10xCards

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Ręczne tworzenie fiszek jest tak żmudne, że zniechęca do nauki metodą powtórek rozłożonych w czasie (SRS — algorytm, który dla każdej fiszki wylicza optymalny termin kolejnej powtórki), zanim użytkownik w ogóle zacznie. 10xCards przenosi wąskie gardło z „godzina tworzenia fiszek” na „wklejam tekst i zaczynam się uczyć”: AI proponuje fiszki, użytkownik je zatwierdza, a gotowa biblioteka SRS planuje powtórki.

## North star

**S-02: użytkownik może wkleić tekst, wygenerować fiszki przez AI, przejrzeć je (zaakceptować, edytować, odrzucić, zaakceptować wszystkie) i zapisać zaakceptowane do swojej talii** — to bezpośredni pomiar głównego kryterium sukcesu („75% fiszek z AI akceptowanych”), więc przy celu `speed` idzie zaraz po swoich minimalnych warunkach wstępnych.

> Gwiazda przewodnia (north star) — najmniejszy kompletny przepływ od początku do końca, którego dowiezienie dowodzi, że produkt rozwiązuje swój problem; ustawiony tak wcześnie, jak pozwalają zależności, bo reszta ma sens tylko wtedy, gdy on działa.

## At a glance

| ID   | Issue                                               | Change ID                 | Outcome (user can …)                                                                                   | Prerequisites | PRD refs                  | Status   |
| ---- | --------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------- | ------------------------- | -------- |
| F-01 | [#1](https://github.com/Bondar91/10xCards/issues/1) | ai-provider-gateway       | (foundation) serwerowe wywołanie dostawcy LLM działa na produkcji, bez retencji tekstu i w limicie CPU | —             | FR-003, NFR prywatność AI | done     |
| S-01 | [#2](https://github.com/Bondar91/10xCards/issues/2) | account-access-production | założyć konto, potwierdzić e-mail, zalogować się i wylogować na produkcji, trafiając do swojej strefy  | —             | FR-001, FR-002            | done |
| S-02 | [#4](https://github.com/Bondar91/10xCards/issues/4) | ai-generation-review      | wkleić tekst, wygenerować fiszki przez AI, przejrzeć je i zapisać zaakceptowane do talii               | F-01, S-01    | US-01, FR-003, FR-004     | done |
| S-03 | [#5](https://github.com/Bondar91/10xCards/issues/5) | deck-browse-edit-delete   | przeglądać swoje zapisane fiszki, edytować je i usuwać                                                 | S-02          | FR-006                    | done |
| S-04 | [#6](https://github.com/Bondar91/10xCards/issues/6) | manual-flashcard-create   | ręcznie dodać fiszkę (przód + tył) bez udziału AI                                                      | S-02          | FR-005                    | in-progress |
| S-05 | [#7](https://github.com/Bondar91/10xCards/issues/7) | srs-review-session        | rozpocząć sesję powtórek, oceniać odpowiedzi i mieć zaktualizowany harmonogram kolejnych powtórek      | S-02          | US-02, FR-007             | done |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme               | Chain                                                   | Note                                                                                          |
| ------ | ------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A      | Generowanie i talia | `F-01` → `S-02` → `S-03` / `S-04` / `S-05` (równolegle) | Ścieżka krytyczna przy celu `speed`; po S-02 trzy wycinki mogą iść w osobnych sesjach agenta. |
| B      | Dostęp do konta     | `S-01`                                                  | Równolegle z F-01; dołącza do strumienia A w S-02.                                            |

## Baseline

What's already in place in the codebase as of `2026-10-27` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 islands + Tailwind 4 + shadcn/ui (`astro.config.mjs`, `src/components/ui/button.tsx`); `src/pages/dashboard.astro` to pusty szkielet.
- **Backend / API:** partial — tylko trasy auth (`src/pages/api/auth/{signin,signup,signout}.ts`); brak tras dla fiszek, AI i SRS.
- **Data:** partial — klient Supabase SSR (`src/lib/supabase.ts`), brak katalogu `supabase/migrations/` i jakiegokolwiek schematu.
- **Auth:** present — e-mail + hasło, sesje w cookies, ochrona tras w `src/middleware.ts` (`PROTECTED_ROUTES = ["/dashboard"]`); zweryfikowane lokalnie (`context/changes/deployment/deployment-plan.md`, faza 5).
- **Deploy / infra:** present — `wrangler.jsonc` pod Workers (`main`, `nodejs_compat`, `env.preview`); auto-deploy z `main` przez Cloudflare Git integration (deployment-plan, faza 6). Brak `.github/workflows/` mimo wzmianki w `CLAUDE.md`; smoke testy produkcyjne (faza 7) nieodhaczone.
- **Observability:** partial — `observability.enabled: true` w `wrangler.jsonc` + `wrangler tail`; brak error trackingu.
- **Integracja AI:** absent — brak klienta dostawcy LLM i sekretu klucza API.

## Foundations

### F-01: Bramka do dostawcy AI

- **Outcome:** (foundation) jedno serwerowe wywołanie wybranego dostawcy LLM działa na wdrożonym Workerze z kluczem w sekretach, mieści się w limicie CPU runtime'u, a polityka retencji dostawcy jest potwierdzona jako zgodna z wymaganiem „tekst nie zostawia śladu”.
- **Change ID:** ai-provider-gateway
- **PRD refs:** FR-003, NFR prywatność AI
- **Unlocks:** S-02; redukuje niewiadome „który dostawca/model spełnia wymóg braku retencji?” (NFR: „Text submitted to AI … leaves no trace in operator-accessible storage”) oraz „czy trasa AI zmieści się w limicie CPU Workers?” (risk register w `infrastructure.md`).
- **Prerequisites:** —
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:**
  - Który dostawca/model gwarantuje brak retencji wysłanego tekstu? — Owner: user. Block: no (rozstrzygane w ramach tego fundamentu).
- **Risk:** Sekwencjonowane pierwsze, bo to jedyna całkowicie nieobecna warstwa, od której zależy gwiazda przewodnia; zakres celowo ograniczony do „jedno wywołanie działa na produkcji” — prompt, parsowanie fiszek i UI należą do S-02.
- **Status:** done

## Slices

### S-01: Dostęp do konta na produkcji

- **Outcome:** użytkownik może założyć konto (e-mail + hasło), potwierdzić e-mail, zalogować się i wylogować na wdrożonej aplikacji, trafiając do swojej chronionej strefy; niezalogowany nie dostaje się do żadnej strony z fiszkami.
- **Change ID:** account-access-production
- **PRD refs:** FR-001, FR-002
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Mechanizm auth już istnieje (baseline), więc wycinek jest mały — domyka przepływ end-to-end na produkcji (smoke testy z fazy 7) i ochronę przyszłych tras fiszek; bez tego S-02 nie ma zalogowanego użytkownika, do którego zapisać talię.
- **Status:** done

### S-02: Generowanie fiszek przez AI z przeglądem

- **Outcome:** użytkownik może wkleić tekst, widzieć postęp podczas generowania, przejrzeć listę proponowanych fiszek (przód/tył), zaakceptować, edytować lub odrzucić każdą albo zaakceptować wszystkie naraz, a zaakceptowane trafiają trwale do jego prywatnej talii.
- **Change ID:** ai-generation-review
- **PRD refs:** US-01, FR-003, FR-004
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy zapisujemy liczbę wygenerowanych vs zaakceptowanych fiszek, żeby mierzyć kryterium 75%? — Owner: user. Block: no (patrz Open Roadmap Question 1).
- **Risk:** Najtrudniejszy wycinek MVP — tu po raz pierwszy powstaje trwały zapis fiszek z izolacją per użytkownik (guardrail prywatności) oraz widoczny postęp przy długich wejściach (ryzyko timeoutu/CPU z `infrastructure.md`); dlatego idzie zaraz po F-01 i S-01.
- **Status:** done

### S-03: Przeglądanie, edycja i usuwanie fiszek

- **Outcome:** użytkownik może zobaczyć listę swoich zapisanych fiszek, poprawić treść dowolnej z nich i usunąć niepotrzebne.
- **Change ID:** deck-browse-edit-delete
- **PRD refs:** FR-006
- **Prerequisites:** S-02
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Bez edycji błędy AI zostają w talii na stałe (PRD, FR-006); sekwencjonowane po S-02, bo dopiero wtedy istnieją fiszki do zarządzania.
- **Status:** done

### S-04: Ręczne dodawanie fiszki

- **Outcome:** użytkownik może dodać fiszkę (przód + tył) bez udziału AI, także wtedy, gdy dostawca AI jest niedostępny.
- **Change ID:** manual-flashcard-create
- **PRD refs:** FR-005
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To ścieżka awaryjna z guardrailu „awaria AI nie blokuje aplikacji”; idzie po S-02 (a nie przed), bo przy celu `speed` korzysta z istniejącego już zapisu fiszek zamiast budować go od zera.
- **Status:** in-progress

### S-05: Sesja powtórek SRS

- **Outcome:** użytkownik może rozpocząć sesję powtórek, widzieć fiszki w kolejności wyznaczonej przez algorytm SRS, po każdej ocenić, jak dobrze ją znał, a termin kolejnej powtórki zostaje zaktualizowany.
- **Change ID:** srs-review-session
- **PRD refs:** US-02, FR-007
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - Która gotowa biblioteka SRS działa w runtime Workers (wymagany ESM, brak zależności od nieobsługiwanych modułów Node)? — Owner: user. Block: no (rozstrzygane w `/10x-plan`; ryzyko z `infrastructure.md`).
- **Risk:** Zamyka pętlę nauki i warunkuje kryterium „powrót następnego dnia”; stan powtórek dochodzi do fiszek dopiero tutaj, więc fiszki zapisane wcześniej muszą dostać stan początkowy.
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                          | Ready for `/10x-plan` | Notes                                    |
| ---------- | ------------------------- | -------------------------------------------------------------- | --------------------- | ---------------------------------------- |
| F-01       | ai-provider-gateway       | [F-01] Bramka AI: wywołanie LLM na produkcji bez retencji      | yes                   | Odblokowuje gwiazdę przewodnią S-02      |
| S-01       | account-access-production | [S-01] Konto: rejestracja, logowanie, wylogowanie na produkcji | yes                   | Równolegle z F-01                        |
| S-02       | ai-generation-review      | [S-02] Wklej tekst → AI → przegląd → zapis do talii            | no                    | Gwiazda przewodnia; czeka na F-01 i S-01 |
| S-03       | deck-browse-edit-delete   | [S-03] Talia: przeglądanie, edycja, usuwanie fiszek            | no                    | Czeka na S-02; równolegle z S-04, S-05   |
| S-04       | manual-flashcard-create   | [S-04] Ręczne dodawanie fiszki                                 | no                    | Czeka na S-02; równolegle z S-03, S-05   |
| S-05       | srs-review-session        | [S-05] Sesja powtórek SRS                                      | no                    | Czeka na S-02; równolegle z S-03, S-04   |

## Open Roadmap Questions

1. ([#3](https://github.com/Bondar91/10xCards/issues/3)) **Jak mierzymy kryteria sukcesu (75% akceptacji, 75% fiszek z AI)?** Czy MVP ma zapisywać liczbę wygenerowanych/zaakceptowanych fiszek i źródło fiszki (AI vs ręczna), czy pomiar odkładamy? — Owner: user. Block: — (nie blokuje; warto rozstrzygnąć przed `/10x-plan` dla S-02 i S-04).

## Parked

- **Własny algorytm powtórek** — Why parked: PRD §Poza zakresem — integrujemy gotową bibliotekę SRS.
- **Import plików (PDF, DOCX itp.)** — Why parked: PRD §Poza zakresem — MVP przyjmuje tylko wklejony tekst.
- **Współdzielenie talii między użytkownikami** — Why parked: PRD §Poza zakresem — fiszki są prywatne.
- **Aplikacje mobilne** — Why parked: PRD §Poza zakresem — MVP tylko web (desktop).
- **Error tracking / rozbudowany monitoring** — Why parked: cel `speed`; baseline ma `wrangler tail` + observability Workers, PRD nie wymaga więcej.
- **CI na PR (lint + build w GitHub Actions)** — Why parked: cel `speed`; deploy działa przez Cloudflare Git integration, a lint odpala się w pre-commit. Uwaga: `CLAUDE.md` opisuje nieistniejący `.github/workflows/ci.yml` — do poprawy w dokumentacji albo do odparkowania.

## Done

(Puste przy pierwszej generacji. `/10x-archive` dopisuje tu wpis i zmienia Status na `done`, gdy zmiana o pasującym Change ID zostanie zarchiwizowana.)

- **F-01: (foundation) jedno serwerowe wywołanie wybranego dostawcy LLM działa na wdrożonym Workerze z kluczem w sekretach, mieści się w limicie CPU runtime'u, a polityka retencji dostawcy jest potwierdzona jako zgodna z wymaganiem „tekst nie zostawia śladu”.** — Archived 2026-10-31 → `context/archive/2026-10-29-ai-provider-gateway/`. Lesson: —.
- **S-01: użytkownik może założyć konto (e-mail + hasło), potwierdzić e-mail, zalogować się i wylogować na wdrożonej aplikacji, trafiając do swojej chronionej strefy; niezalogowany nie dostaje się do żadnej strony z fiszkami.** — Archived 2026-10-31 → `context/archive/2026-10-29-account-access-production/`. Lesson: —.
- **S-05: użytkownik może rozpocząć sesję powtórek, widzieć fiszki w kolejności wyznaczonej przez algorytm SRS, po każdej ocenić, jak dobrze ją znał, a termin kolejnej powtórki zostaje zaktualizowany.** — Archived 2026-10-31 → `context/archive/2026-10-31-srs-review-session/`. Lesson: —.
- **S-03: użytkownik może zobaczyć listę swoich zapisanych fiszek, poprawić treść dowolnej z nich i usunąć niepotrzebne.** — Archived 2026-11-01 → `context/archive/2026-11-01-deck-browse-edit-delete/`. Lesson: —.
- **S-02: użytkownik może wkleić tekst, widzieć postęp podczas generowania, przejrzeć listę proponowanych fiszek (przód/tył), zaakceptować, edytować lub odrzucić każdą albo zaakceptować wszystkie naraz, a zaakceptowane trafiają trwale do jego prywatnej talii.** — Archived 2026-11-01 → `context/archive/2026-10-31-ai-generation-review/`. Lesson: —.

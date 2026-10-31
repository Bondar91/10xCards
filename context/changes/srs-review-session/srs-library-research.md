# Research: biblioteka SRS dla S-05 (srs-review-session)

> Źródło: wyszukiwanie Exa (`web_search_exa`) + weryfikacja `npm view`, 2026-10-31.
> Kontekst: rozstrzyga niewiadomą z roadmapy S-05 — „Która gotowa biblioteka SRS działa w runtime Workers (wymagany ESM, brak zależności od nieobsługiwanych modułów Node)?”
> Stack: Astro 6 SSR na Cloudflare Workers, TypeScript, npm (`context/foundation/tech-stack.md`).

## Rekomendacja

**`ts-fsrs@^5.4.2`** (algorytm FSRS, organizacja open-spaced-repetition, MIT).

- Czysty TypeScript, ESM/CJS/UMD, **0 zależności**, brak modułów Node → działa w Workers.
- De facto standard (~360k pobrań/tydzień), aktywnie utrzymywany.
- `engines.node >= 20` — zgodne z Node 22.14 z `CLAUDE.md`.

### Dlaczego nie `ts-fsrs@6.0.0`

- Wydana 2026-10-28 (3 dni przed researchem) — świeży major z całkowicie przebudowanym API (`await DefaultScheduler()`, `scheduler.review()`, pola camelCase: `dueAt`, `stabilityFast`, `learningStep`, `scheduleStatus`). Dokumentacja/przykłady w sieci w większości dotyczą v5.
- `engines.node >= 24.0.0` (lokalnie jest v24.14.0, ale `CLAUDE.md` deklaruje 22.14, `.nvmrc` nie istnieje w repo).
- Dodaje zależność `@open-spaced-repetition/srs-kit`.
- Przy celu `speed` — niepotrzebne ryzyko. Migracja do v6 możliwa później.

## Porównanie kandydatów

| Biblioteka                                  | Algorytm      | Wersja                      | Zależności                    | Workers                       | Uwagi                                                            |
| ------------------------------------------- | ------------- | --------------------------- | ----------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| **`ts-fsrs`**                               | FSRS-3…7      | 5.4.2 (stabilna) / 6.0.0    | v5: 0 / v6: `srs-kit`         | ✔                             | Standard, MIT, ~360k/tydz.                                       |
| `@open-spaced-repetition/sm-2`              | SM-2          | 0.2.1                       | 0                             | ✔ ESM                         | Ta sama organizacja; autorzy oznaczają jako „unstable”, ~13/tydz. |
| `supermemo`                                 | SM-2          | 2.0.23                      | 0                             | ✔ (JSR: Workers potwierdzone) | Jedna funkcja, 3 pola; ostatni release 03.2025                   |
| `femto-fsrs`                                | FSRS          | 2.0.0                       | 0                             | ✔                             | Minimalna; ostatni release 05.2025                               |
| `quanta-fsrs`                               | FSRS 4.5/5    | 1.0.3                       | 0                             | deklaruje edge-ready          | Niszowa, 0 dependents                                            |
| `@squeakyrobot/fsrs`                        | FSRS 4.5 (+v6) | 1.0.0                      | 0                             | deklaruje Workers             | Niszowa, ~11/tydz.                                               |
| `@monkey-dev-vibes/spaced-repetition`       | SM-2          | 0.1.0                       | 0                             | deklaruje Workers             | Niszowa, ~4/tydz.                                                |

FSRS vs SM-2 (benchmark fsrs-benchmark, cytowany przez `@squeakyrobot/fsrs`): log-loss SM-2 0.73 vs FSRS v4.5 0.36 — FSRS wyraźnie lepiej przewiduje zapamiętanie.

## API `ts-fsrs` v5 (to, czego użyjemy)

```ts
import { createEmptyCard, fsrs, Rating, State } from "ts-fsrs";

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
});

const card = createEmptyCard(); // nowa karta, due = teraz

// podgląd 4 wyników (np. do pokazania interwałów na przyciskach)
const preview = scheduler.repeat(card, new Date());
preview[Rating.Good].card;

// zastosowanie oceny użytkownika
const { card: nextCard, log } = scheduler.next(card, new Date(), Rating.Good);
```

- `Rating`: `Again`, `Hard`, `Good`, `Easy` (1–4).
- `State`: `New`, `Learning`, `Review`, `Relearning`.
- `afterHandler` w `next()` pozwala zmapować wynik na kształt zapisu w DB (np. daty → timestamp).
- Pomocnicze: `get_retrievability`, `rollback(card, log)`, `forget(card, now)`, `reschedule(card, reviews)`.
- Parametry z zewnątrz walidować na granicy aplikacji (zod — zgodnie z konwencją projektu).

## Implikacje dla danych (Supabase)

Pola `Card` w v5 do przechowania per fiszka:
`due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `learning_steps`, `reps`, `lapses`, `state`, `last_review`.

- Opcjonalnie tabela `review_logs` na wynik `log` (rating, state, due, review, …) — przydatna do późniejszej optymalizacji parametrów i statystyk.
- **Backfill:** fiszki zapisane przed S-05 muszą dostać stan początkowy (wartości z `createEmptyCard()`), zgodnie z ryzykiem w roadmapie.
- Kolejka sesji: fiszki użytkownika z `due <= now()` posortowane po `due` (indeks na `(user_id, due)`); RLS per użytkownik.

## Alternatywa „maksymalnie prosto”

`supermemo` (SM-2): `supermemo(item, grade)` z polami `interval`, `repetition`, `efactor` + własne liczenie `due`. Słabszy algorytm, pakiet nierozwijany — tylko jeśli FSRS okaże się problematyczny.

## Źródła

- https://www.npmjs.com/package/ts-fsrs
- https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/fsrs/README.md
- https://open-spaced-repetition.github.io/ts-fsrs/
- https://www.npmjs.com/package/@open-spaced-repetition/sm-2
- https://jsr.io/@vien/supermemo/doc
- https://www.npmjs.com/package/quanta-fsrs
- https://www.npmjs.com/package/@squeakyrobot/fsrs
- https://www.npmjs.com/package/@monkey-dev-vibes/spaced-repetition

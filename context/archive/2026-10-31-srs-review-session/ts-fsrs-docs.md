# Dokumentacja `ts-fsrs` dla S-05 (srs-review-session)

> Źródło: Context7 (`/open-spaced-repetition/ts-fsrs`, High reputation, 710 snippetów), pobrane 2026-10-31.
> Pliki źródłowe: `README.md`, `packages/fsrs/README.md`, `_autodocs/api-reference/{fsrs,convert,default}.md`, `_autodocs/{types,configuration}.md`.
> Wersja docelowa: `ts-fsrs@^5.4.2` (patrz [srs-library-research.md](srs-library-research.md)). Przykłady z Context7 używają API v5 (`fsrs()`, pola snake_case), nie v6 (`DefaultScheduler()`, camelCase) — przy implementacji zweryfikować sygnatury z typami w `node_modules/ts-fsrs` po instalacji.

## 1. Podstawowy przepływ

```ts
import { createEmptyCard, fsrs, Rating } from "ts-fsrs";

const scheduler = fsrs(); // domyślne parametry
const card = createEmptyCard(); // nowa karta, due = teraz, state = New

// Podgląd 4 możliwych wyników (np. interwały na przyciskach oceny)
const preview = scheduler.repeat(card, new Date());
preview[Rating.Again].card;
preview[Rating.Hard].card;
preview[Rating.Good].card;
preview[Rating.Easy].card;

// Zastosowanie oceny użytkownika
const { card: nextCard, log } = scheduler.next(card, new Date(), Rating.Good);
```

### `next(card, now, grade[, afterHandler])`

```ts
next(card: CardInput | Card, now: DateInput, grade: Grade): RecordLogItem
next<R>(card: CardInput | Card, now: DateInput, grade: Grade, afterHandler: (r: RecordLogItem) => R): R
```

- `grade`: `Rating.Again` (1), `Rating.Hard` (2), `Rating.Good` (3), `Rating.Easy` (4).
- Zwraca `{ card: Card; log: ReviewLog }` tylko dla wybranej oceny.
- Rzuca błąd o `name === "FSRSValidationError"`:
  - `'Cannot review a manual rating'` dla `Rating.Manual` (0),
  - gdy ocena nie jest skończona lub spoza 1–4.
- ⚠ **W v5.4.2 klasa `FSRSValidationError` nie jest eksportowana** (zweryfikowane w `dist/index.d.ts`) — nie da się jej zaimportować ani użyć `instanceof`. Docs Context7 pochodzą z gałęzi `main` (bliżej v6).
- **Wniosek dla API:** walidować `rating` zodem jako `z.number().int().min(1).max(4)` na granicy trasy; nieoczekiwany wyjątek z biblioteki → 500 (ew. rozpoznanie po `e.name`).

## 2. Zapis w bazie i odczyt

### `afterHandler` — mapowanie wyniku na kształt zapisu

```ts
const saved = scheduler.next(card, new Date(), Rating.Good, ({ card, log }) => ({
  card: {
    ...card,
    due: card.due.getTime(),
    last_review: card.last_review?.getTime() ?? null,
  },
  log: {
    ...log,
    due: log.due.getTime(),
    review: log.review.getTime(),
  },
}));
```

W naszym przypadku (Supabase, `timestamptz`) zamiast `getTime()` → `toISOString()`.

### `TypeConvert.card(card)` — normalizacja wiersza z DB

```ts
import { TypeConvert } from "ts-fsrs";

const card = TypeConvert.card({
  due: "2025-01-01",
  state: "New",
  stability: 0,
  difficulty: 0,
  elapsed_days: 0,
  scheduled_days: 0,
  learning_steps: 0,
  reps: 0,
  lapses: 0,
});
// card.due instanceof Date === true, card.state === 0
```

- `state`: string (`"Review"`) lub liczba → `State` (liczba).
- `due` / `last_review`: string / number → `Date`.
- `last_review`: `null` (i `0`) → `undefined` — więc kolumna nullable w DB jest OK.
- Rzuca `FSRSValidationError` przy niepoprawnym `state` lub dacie.
- Analogicznie `TypeConvert.review_log(log)` (konwertuje `due`, `rating`, `state`, `review`).

### Pola do przechowania

**Card:** `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `learning_steps`, `reps`, `lapses`, `state`, `last_review`.

**ReviewLog:** `rating`, `state`, `due`, `review`, `stability`, `difficulty`, `scheduled_days`, `learning_steps`, `elapsed_days`, `last_elapsed_days` (opcjonalna tabela `review_logs`).

> ⚠ W v5.4.2 `elapsed_days` (Card, ReviewLog) i `last_elapsed_days` (ReviewLog) są `@deprecated` — usunięte w v6. W v5 `Card.elapsed_days` jest nadal wymaganym polem typu.

- `State`: `New` (0), `Learning` (1), `Review` (2), `Relearning` (3).
- Backfill istniejących fiszek: wartości z `createEmptyCard()` — `state = 0`, liczniki/stability/difficulty = 0, `due = now()`, `last_review = null`.

## 3. Parametry schedulera

```ts
import { fsrs, generatorParameters } from "ts-fsrs";

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
});
```

| Pole                | Typ        | Domyślnie              | Opis                                                                                 |
| ------------------- | ---------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `request_retention` | `number`   | `0.9`                  | Docelowa retencja, `0 < r <= 1`. Wyższa → więcej powtórek.                           |
| `maximum_interval`  | `number`   | `36500`                | Maksymalny interwał w dniach.                                                        |
| `w`                 | `number[]` | `default_w` (21 wag)   | Wagi FSRS; migrowane i przycinane do poprawnego zakresu.                             |
| `enable_fuzz`       | `boolean`  | `false`                | Deterministyczna losowość dla interwałów `>= 2.5` dnia (rozprasza powtórki).         |
| `enable_short_term` | `boolean`  | `true`                 | Kroki (re)learning; `false` → `LongTermScheduler` (tylko interwały dzienne).         |
| `learning_steps`    | `Steps`    | `['1m', '10m']`        | Kroki dla stanów New/Learning (`<liczba>m\|h\|d`).                                   |
| `relearning_steps`  | `Steps`    | `['10m']`              | Kroki po zapomnieniu (Review → Relearning).                                          |

- `generatorParameters(props?)` zwraca pełny obiekt `FSRSParameters` (uzupełnia domyślne, migruje wagi). Uwaga: `request_retention: 0` → fallback na `0.9`.
- Parametry są serializowalne do JSON (`JSON.stringify(params)` → `fsrs(restored)`).

**Do decyzji w `/10x-plan`:** przy `enable_short_term: true` karta po ocenie `Again`/`Hard` wraca w tej samej sesji po 1–10 min — sesja musi albo ponownie dobierać karty z `due <= now()`, albo traktować kroki krótkoterminowe jako „na koniec sesji”. Alternatywa upraszczająca MVP: `enable_short_term: false` (tylko interwały dzienne).

## 4. Inne przydatne API (z researchu, nie pobierane szczegółowo)

- `scheduler.get_retrievability(card, now, format = true)` — prawdopodobieństwo przypomnienia; domyślnie **string** (np. `"90.00%"`), liczba przy `format: false`.
- `scheduler.rollback(card, log)` — cofnięcie oceny („undo”).
- `scheduler.forget(card, now, reset_count?)` — reset karty.
- `scheduler.reschedule(card, reviews)` — przeliczenie z historii logów.

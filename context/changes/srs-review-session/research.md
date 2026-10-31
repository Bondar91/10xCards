---
date: 2026-10-31T19:24:52+01:00
researcher: Claude (Opus 5.5)
git_commit: 8ec083b4b233a183334ff51d9abb05b2a724df37
branch: main
repository: Bondar91/10xCards
topic: "Czy dokumentacja ts-fsrs (ts-fsrs-docs.md) jest zgodna z codebase i wystarcza do implementacji S-05?"
tags: [research, codebase, srs, ts-fsrs, supabase, rls, flashcards, workers]
status: complete
last_updated: 2026-10-31
last_updated_by: Claude (Opus 5.5)
---

# Research: zgodność `ts-fsrs` z codebase dla S-05 (srs-review-session)

**Date**: 2026-10-31T19:24:52+01:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 8ec083b4b233a183334ff51d9abb05b2a724df37
**Branch**: main
**Repository**: Bondar91/10xCards

## Research Question

Przejrzyj codebase i oceń, czy [ts-fsrs-docs.md](ts-fsrs-docs.md) jest z nim zgodny. Celem jest implementacja S-05 z `context/foundation/roadmap.md`: użytkownik rozpoczyna sesję powtórek, widzi fiszki w kolejności wyznaczonej przez SRS, ocenia każdą, a termin kolejnej powtórki się aktualizuje (US-02, FR-007).

## Summary

**Werdykt: zgodne, z 4 poprawkami do dokumentacji i 3 decyzjami do `/10x-plan`.**

1. **Runtime (Workers) — OK.** Paczka `ts-fsrs@5.4.2` (zweryfikowana statycznie z tarballa npm): `"type": "module"`, eksport `import → dist/index.mjs`, **zero instrukcji `import`** w `index.mjs` (brak `node:*`, brak zależności), `engines.node >= 20`. Ryzyko z rejestru `infrastructure.md:80` („SRS library ships CJS-only”) jest zamknięte.
2. **API z dokumentu — w większości zgodne z v5.4.2** (`fsrs()`, `createEmptyCard`, `repeat`, `next`, `afterHandler`, `TypeConvert.card`, `Rating`, `State`, domyślne parametry). Rozbieżności pochodzą z tego, że Context7 indeksuje gałąź `main` (`_autodocs/`), która jest już bliżej v6:
   - `FSRSValidationError` **nie jest eksportowany** z v5.4.2 (klasa istnieje wewnętrznie, `name = "FSRSValidationError"`, ale `import { FSRSValidationError }` się nie skompiluje).
   - `elapsed_days` (Card) oraz `elapsed_days` / `last_elapsed_days` (ReviewLog) są w v5 oznaczone `@deprecated` (usunięte w v6) — dokument tego nie odnotowuje.
   - `get_retrievability(card, now, format = true)` domyślnie zwraca **string** (np. `"90.00%"`); liczbę daje dopiero `format: false`.
   - `forget(card, now, reset_count?)` ma dodatkowy parametr.
3. **Codebase nie ma jeszcze żadnego stanu SRS.** Tabela `flashcards` (`supabase/migrations/20261031120000_flashcards_and_generations.sql:37-46`) ma tylko treść i metadane; **brak polityki UPDATE** (`:61` — „UPDATE / DELETE policies arrive with S-03”). S-05 musi więc dodać schemat SRS **i** ścieżkę zapisu (polityka UPDATE albo RPC `SECURITY DEFINER`).
4. Wzorce do powielenia są gotowe: trasy API z zod + `jsonError`, RPC z jawnym `auth.uid()`, hook React w `src/components/hooks/`, strona Astro z wyspą React, middleware default-deny.

## Detailed Findings

### 1. Biblioteka `ts-fsrs@5.4.2` vs dokument

Zweryfikowane na `dist/index.d.ts` i `dist/index.mjs` z `npm pack ts-fsrs@5.4.2` (scratchpad, nie dodane do projektu).

| Element w `ts-fsrs-docs.md` | Stan w v5.4.2 | Ocena |
| --- | --- | --- |
| `fsrs(params?)`, `createEmptyCard(now?)` | Są; `createEmptyCard` daje `state = New`, wszystkie liczniki 0, `last_review = undefined` | ✔ |
| `repeat(card, now)` → `IPreview` indeksowany `Rating` | `repeat(card: CardInput \| Card, now: DateInput)` | ✔ |
| `next(card, now, grade[, afterHandler])` | Identyczna sygnatura | ✔ |
| `Rating` 0–4, `State` 0–3 | `Manual=0, Again=1, Hard=2, Good=3, Easy=4`; `New=0, Learning=1, Review=2, Relearning=3` | ✔ |
| Błąd `'Cannot review a manual rating'`, `Invalid grade … expected 1-4` | Są (`index.mjs:1647`, `:358`) | ✔ |
| `FSRSValidationError` jako typ do łapania | **Nieeksportowany** (`index.d.ts:593` — lista eksportów) | ✘ poprawić |
| `TypeConvert.card` / `review_log` | Eksportowane; `CardInput.last_review?: DateInput \| null`, `DateInput = Date \| number \| string` | ✔ (ISO string z Supabase przejdzie) |
| Pola `Card` | `due, stability, difficulty, elapsed_days (@deprecated), scheduled_days, learning_steps, reps, lapses, state, last_review?` | ⚠ dopisać deprecation |
| Pola `ReviewLog` | `rating, state, due, stability, difficulty, elapsed_days (@dep.), last_elapsed_days (@dep.), scheduled_days, learning_steps, review` | ⚠ |
| Domyślne parametry | `request_retention 0.9`, `maximum_interval 36500`, `enable_fuzz false`, `enable_short_term true`, `learning_steps ['1m','10m']`, `relearning_steps ['10m']` (`index.mjs:503-511`) | ✔ |
| `get_retrievability(card, now)` | `format = true` domyślnie → string | ⚠ dopisać |

Weryfikacja runtime (uruchomienie paczki w Node/`workerd`) **nie została wykonana** — wykonanie pobranego kodu zostało zablokowane przez tryb uprawnień. Po `npm install ts-fsrs@5.4.2` w projekcie zrobić to w ramach fazy 1 planu (`npm run build` + `wrangler dev`, zgodnie z mitigacją w `infrastructure.md:80`).

### 2. Model danych — co jest i czego brakuje

- `flashcards`: `id, user_id, generation_id, front, back, source, created_at, updated_at` (`20261031120000_flashcards_and_generations.sql:37-46`). Indeks tylko `(user_id)` i `(generation_id)` (`:48-49`).
- RLS: SELECT own (`:53-55`), INSERT own zawężony do `source = 'manual' and generation_id is null` (`20261031180000_tighten_insert_policies.sql:18-24`). **Brak UPDATE/DELETE.**
- Karty AI powstają wyłącznie w `save_generation()` (`20261031120000…sql:105-112`) — `insert` wymienia kolumny jawnie, więc **nowe kolumny SRS z wartościami `default` wypełnią się automatycznie** zarówno dla kart AI, jak i przyszłych ręcznych (S-04), bez zmiany RPC.
- Typy DB: `src/db/database.types.ts:42-82` (generowane, `PostgrestVersion 14.5`) — po migracji trzeba je zregenerować.
- `updated_at` nie ma triggera (tylko `default now()`), więc zapis stanu SRS go nie ruszy, o ile kod sam go nie ustawi. Semantycznie `updated_at` = edycja treści (S-03).

Mapowanie `Card` → kolumny (propozycja do planu):

| Pole `Card` | Typ Postgres | Default (= `createEmptyCard`) |
| --- | --- | --- |
| `due` | `timestamptz not null` | `now()` |
| `stability`, `difficulty` | `double precision not null` | `0` |
| `elapsed_days`, `scheduled_days`, `learning_steps`, `reps`, `lapses` | `int not null` | `0` |
| `state` | `smallint not null check (state between 0 and 3)` | `0` |
| `last_review` | `timestamptz null` | `null` |

Backfill (ryzyko z roadmapy S-05) rozwiązuje się sam przez `alter table … add column … default …` — istniejące wiersze dostają stan `New` z `due = now()`.

### 3. Ścieżka zapisu oceny — wzorce w codebase

- Trasy API: `export const prerender = false`, sprawdzenie `context.locals.user`, `bodyTooLarge`, `request.json()` w try/catch, `zod.safeParse`, `createClient`, mapowanie kodów błędów na `jsonError(msg, status, kind)` — wzorzec w `src/pages/api/generations/[id]/save.ts:9-84`.
- Atomowe zapisy idą przez RPC `SECURITY DEFINER` z `set search_path = ''`, jawnym filtrem `auth.uid()` i własnymi `errcode` (`GN404`, `GN409`) — `20261031120000…sql:67-129`; mapowanie kodów w `save.ts:57-81`.
- Helpery odpowiedzi: `src/lib/api-response.ts:3-17`.
- Middleware jest default-deny (`src/middleware.ts:4-6, 44-60`): nowe `/review` i `/api/reviews/*` będą chronione bez zmian w middleware; API bez sesji dostaje 401 JSON.
- Lekcja projektu: importować `zod`, nie `astro/zod` (`context/foundation/lessons.md`).

### 4. UI — wzorce

- Strona Astro + wyspa React `client:load`: `src/pages/generate.astro:1-18`.
- Logika i wywołania API w hooku: `src/components/hooks/useFlashcardGeneration.ts` (maszyna stanów `GenerationStep`, `postJson<T>` z mapą komunikatów `STATUS_MESSAGES`, komunikaty po polsku).
- Panel: `src/pages/dashboard.astro:7-37` liczy fiszki przez `select("*", { count: "exact", head: true })` i ma link „Generuj fiszki” — naturalne miejsce na „Rozpocznij powtórki (N do powtórki)”.
- Klasy przycisków jako stałe + `cn()` (`src/components/generate/FlashcardGenerator.tsx:12-15`).

### 5. Wydajność / CPU na Workers

FSRS to kilka operacji zmiennoprzecinkowych na kartę — pomijalne wobec zmierzonych 13–18 ms CPU tras S-02 (`infrastructure.md:81`). Koszt zdominuje `getUser()` w middleware i round-trip do Supabase, jak dotąd.

## Code References

- [`supabase/migrations/20261031120000_flashcards_and_generations.sql:37-61`](https://github.com/Bondar91/10xCards/blob/8ec083b4b233a183334ff51d9abb05b2a724df37/supabase/migrations/20261031120000_flashcards_and_generations.sql#L37-L61) — tabela `flashcards`, indeksy, RLS, brak UPDATE
- [`supabase/migrations/20261031120000_flashcards_and_generations.sql:67-129`](https://github.com/Bondar91/10xCards/blob/8ec083b4b233a183334ff51d9abb05b2a724df37/supabase/migrations/20261031120000_flashcards_and_generations.sql#L67-L129) — wzorzec RPC `SECURITY DEFINER`
- [`supabase/migrations/20261031180000_tighten_insert_policies.sql:16-24`](https://github.com/Bondar91/10xCards/blob/8ec083b4b233a183334ff51d9abb05b2a724df37/supabase/migrations/20261031180000_tighten_insert_policies.sql#L16-L24) — INSERT tylko dla kart ręcznych
- [`src/db/database.types.ts:42-82`](https://github.com/Bondar91/10xCards/blob/8ec083b4b233a183334ff51d9abb05b2a724df37/src/db/database.types.ts#L42-L82) — typy `flashcards` do regeneracji
- [`src/pages/api/generations/[id]/save.ts:9-84`](https://github.com/Bondar91/10xCards/blob/8ec083b4b233a183334ff51d9abb05b2a724df37/src/pages/api/generations/%5Bid%5D/save.ts#L9-L84) — wzorzec trasy z zod + RPC + mapowanie błędów
- [`src/lib/api-response.ts:3-17`](https://github.com/Bondar91/10xCards/blob/8ec083b4b233a183334ff51d9abb05b2a724df37/src/lib/api-response.ts#L3-L17) — `json`, `jsonError`, `bodyTooLarge`
- [`src/middleware.ts:4-60`](https://github.com/Bondar91/10xCards/blob/8ec083b4b233a183334ff51d9abb05b2a724df37/src/middleware.ts#L4-L60) — default-deny, 401 dla `/api`
- [`src/types.ts:1-33`](https://github.com/Bondar91/10xCards/blob/8ec083b4b233a183334ff51d9abb05b2a724df37/src/types.ts#L1-L33) — DTO; tu dojdą typy sesji powtórek
- [`src/components/hooks/useFlashcardGeneration.ts`](https://github.com/Bondar91/10xCards/blob/8ec083b4b233a183334ff51d9abb05b2a724df37/src/components/hooks/useFlashcardGeneration.ts) — wzorzec hooka i `postJson`
- [`src/pages/dashboard.astro:7-37`](https://github.com/Bondar91/10xCards/blob/8ec083b4b233a183334ff51d9abb05b2a724df37/src/pages/dashboard.astro#L7-L37) — punkt wejścia do sesji
- `package.json` — brak `ts-fsrs`; `zod ^4.6.7` już jest
- `ts-fsrs@5.4.2 dist/index.d.ts:43-62, 394-400, 476-487, 593` — `Card`/`CardInput`, `TypeConvert`, metody `FSRS`, lista eksportów

## Architecture Insights

- **Gdzie liczyć harmonogram: na serwerze.** Klient wysyła tylko `{ flashcardId, rating }`; trasa ładuje kartę (RLS), woła `scheduler.next(TypeConvert.card(row), new Date(), rating)` i zapisuje wynik. Trzyma to zod-walidację na granicy (konwencja `CLAUDE.md`) i nie wysyła biblioteki do przeglądarki. `repeat()` można wołać serwerowo przy pobieraniu kolejki, jeśli UI ma pokazywać interwały na przyciskach.
- **Instancja schedulera jako moduł w `src/lib/services/`** (np. `srs.ts` z `fsrs({...})` i mapperami row↔Card) — jedno miejsce na parametry, zgodnie z konwencją „Services/helpers go in `src/lib/`”.
- **Walidacja zamiast łapania `FSRSValidationError`.** Skoro klasa nie jest eksportowana w v5, rating waliduj zodem (`z.union([z.literal(1), …, z.literal(4)])` lub `int().min(1).max(4)`); nieoczekiwany wyjątek z biblioteki traktować jako 500 (ew. rozpoznawać po `e.name`).
- **Kolejność sesji:** `due <= now()` sortowane `due asc`, z limitem; nowy indeks `(user_id, due)`.

## Historical Context (from prior changes)

- `context/changes/srs-review-session/srs-library-research.md` — wybór `ts-fsrs@^5.4.2` zamiast 6.0.0 (świeży major, Node ≥ 24, dodatkowa zależność).
- `context/changes/srs-review-session/ts-fsrs-docs.md` — dokumentacja z Context7 (przedmiot tej weryfikacji).
- `context/changes/ai-generation-review/plan.md:44-45, 60, 89` — S-02 świadomie wyłączył stan SRS i polityki UPDATE/DELETE; atomowość przez RPC `SECURITY DEFINER`.
- `context/foundation/infrastructure.md:52, 58, 80` — ryzyko CJS-only/`node:*` w bibliotece SRS i mitigacja (import ESM + `wrangler dev`).
- `context/foundation/lessons.md` — import `zod` bezpośrednio.

## Related Research

- `context/changes/srs-review-session/srs-library-research.md`
- `context/changes/srs-review-session/ts-fsrs-docs.md`

## Open Questions (do rozstrzygnięcia w `/10x-plan`)

1. **Gdzie trzymać stan SRS?**
   - (a) kolumny na `flashcards` z defaultami — najprostsze, backfill za darmo; wymaga polityki UPDATE lub RPC. **Ryzyko kolizji z S-03** (równoległy, też doda UPDATE na `flashcards`): polityka UPDATE dla wszystkich kolumn pozwoliłaby też edytować treść — przy S-05 lepiej RPC zawężone do kolumn SRS.
   - (b) osobna tabela 1:1 `flashcard_reviews`/`srs_state` — brak wiersza = karta `New` (`due = flashcards.created_at`); nie dotyka polityk `flashcards`, ale wymaga LEFT JOIN i upsertu.
2. **`enable_short_term`:** `true` (domyślne) — karty `Again/Hard` wracają po 1–10 min, sesja musi dobierać je ponownie; `false` — tylko interwały dzienne, prostsza sesja „przejdź przez listę”.
3. **Historia ocen (`review_logs`)** — potrzebna teraz (statystyki, przyszła optymalizacja wag, `rollback`) czy odkładamy? Jeśli tak, zapis karty + logu w jednym RPC (wzorzec `save_generation`).
4. Drobne: limit kart na sesję; czy `enable_fuzz: true`; czy przechowywać zdeprecjonowane `elapsed_days` (wymagane przez typ `Card` w v5, w v6 znika — tanio trzymać, lub mapować na `0` przy odczycie).

## Poprawki do `ts-fsrs-docs.md`

- Usunąć sugestię mapowania `FSRSValidationError` przez typ — w v5.4.2 nieeksportowany; walidować zodem.
- Oznaczyć `elapsed_days` / `last_elapsed_days` jako `@deprecated` (v6 usuwa).
- `get_retrievability(card, now, false)` dla liczby; domyślnie string.
- `forget(card, now, reset_count?)`.
- Adnotacja źródła: Context7 indeksuje gałąź `main` (`_autodocs/`), nie tag `v5.4.2`.

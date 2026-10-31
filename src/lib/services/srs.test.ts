import { describe, expect, it } from "vitest";
import { Rating, State, type Grade } from "ts-fsrs";
import {
  cardToRow,
  cardToRpcArgs,
  formatInterval,
  intervalLabels,
  logToJson,
  rateCard,
  RatingSchema,
  REQUEUE_WINDOW_MS,
  rowToCard,
  scheduler,
  shouldRequeue,
  type ReviewGrade,
  type SrsRow,
} from "./srs";

const NOW = new Date("2026-10-31T12:00:00.000Z");
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const newRow = (): SrsRow => ({
  due: "2026-10-30T08:00:00.000Z",
  stability: 0,
  difficulty: 0,
  elapsed_days: 0,
  scheduled_days: 0,
  learning_steps: 0,
  reps: 0,
  lapses: 0,
  state: 0,
  last_review: null,
});

/** A card in Review state with stability well above 1 day. */
const reviewRow = (): SrsRow => {
  let row = newRow();
  let now = NOW;
  for (let i = 0; i < 3; i++) {
    const { card } = rateCard(row, Rating.Easy, now);
    row = cardToRow(card);
    now = new Date(card.due.getTime());
  }
  return row;
};

describe("rowToCard", () => {
  it("converts ISO strings and null last_review", () => {
    const card = rowToCard(newRow());
    expect(card.due).toBeInstanceOf(Date);
    expect(card.due.toISOString()).toBe("2026-10-30T08:00:00.000Z");
    expect(card.last_review).toBeUndefined();
    expect(card.state).toBe(State.New);
  });
});

describe("rateCard", () => {
  it.each([1, 2, 3, 4] as ReviewGrade[])(
    "rating %i on a New card",
    (rating) => {
      const { card, log } = rateCard(newRow(), rating, NOW);
      expect(card.reps).toBe(1);
      expect(log.rating).toBe(rating);
      expect(log.state).toBe(State.New);
      expect(card.last_review?.toISOString()).toBe(NOW.toISOString());
    },
  );

  it("round-trips through RPC args and back", () => {
    const { card } = rateCard(newRow(), Rating.Good, NOW);
    const args = cardToRpcArgs(card);
    const back = rowToCard({
      due: args.p_due,
      stability: args.p_stability,
      difficulty: args.p_difficulty,
      elapsed_days: args.p_elapsed_days,
      scheduled_days: args.p_scheduled_days,
      learning_steps: args.p_learning_steps,
      reps: args.p_reps,
      lapses: args.p_lapses,
      state: args.p_state,
      last_review: args.p_last_review,
    });
    expect(back.due.getTime()).toBe(card.due.getTime());
    expect(back.stability).toBe(card.stability);
    expect(back.difficulty).toBe(card.difficulty);
    expect(back.state).toBe(card.state);
    expect(back.last_review?.getTime()).toBe(NOW.getTime());
  });

  it("serialises the log with ISO dates and without deprecated fields", () => {
    const { log } = rateCard(newRow(), Rating.Again, NOW);
    const json = logToJson(log);
    expect(json.review).toBe(NOW.toISOString());
    expect(json.rating).toBe(1);
    expect(json).not.toHaveProperty("elapsed_days");
    expect(json).not.toHaveProperty("last_elapsed_days");
  });

  it("is deterministic for a fixed now (fuzz seeded from card + time)", () => {
    const row = reviewRow();
    const later = new Date(new Date(row.due).getTime() + DAY);
    const a = rateCard(row, Rating.Good, later).card.due.getTime();
    const b = rateCard(row, Rating.Good, later).card.due.getTime();
    expect(a).toBe(b);
  });
});

describe("RatingSchema", () => {
  it.each([0, 5, 2.5, "3", null])("rejects %p", (value) => {
    expect(RatingSchema.safeParse(value).success).toBe(false);
  });
  it.each([1, 2, 3, 4])("accepts %i", (value) => {
    expect(RatingSchema.parse(value)).toBe(value);
  });
});

describe("formatInterval", () => {
  it.each([
    [30 * 1000, "<1 min"],
    [10 * MIN, "10 min"],
    [59 * MIN, "59 min"],
    [HOUR, "1 godz."],
    [23 * HOUR, "23 godz."],
    [DAY, "1 dzień"],
    [3 * DAY, "3 dni"],
    [30 * DAY, "1 mies."],
    [365 * DAY, "1 rok"],
    [3 * 365 * DAY, "3 lata"],
    [5 * 365 * DAY, "5 lat"],
  ])("%i ms → %s", (ms, label) => {
    expect(formatInterval(ms)).toBe(label);
  });
});

describe("shouldRequeue", () => {
  it("Again on a New card → true", () => {
    const { card } = rateCard(newRow(), Rating.Again, NOW);
    expect(shouldRequeue(card, NOW)).toBe(true);
  });

  it("Good on a review card with stability > 1 → false", () => {
    const row = reviewRow();
    expect(row.state).toBe(State.Review);
    expect(row.stability).toBeGreaterThan(1);
    const now = new Date(row.due);
    const { card } = rateCard(row, Rating.Good, now);
    expect(shouldRequeue(card, now)).toBe(false);
  });

  it("boundary: exactly 20 min → true, +1 ms → false", () => {
    const card = rowToCard(newRow());
    card.due = new Date(NOW.getTime() + REQUEUE_WINDOW_MS);
    expect(shouldRequeue(card, NOW)).toBe(true);
    card.due = new Date(NOW.getTime() + REQUEUE_WINDOW_MS + 1);
    expect(shouldRequeue(card, NOW)).toBe(false);
  });
});

describe("intervalLabels", () => {
  it("returns four labels ordered Again ≤ Hard ≤ Good ≤ Easy", () => {
    for (const row of [newRow(), reviewRow()]) {
      const now = new Date(
        Math.max(NOW.getTime(), new Date(row.due).getTime()),
      );
      const labels = intervalLabels(row, now);
      for (const r of [1, 2, 3, 4] as const) {
        expect(labels[r]).toMatch(/\S/);
      }
      const preview = scheduler.repeat(rowToCard(row), now);
      const grades: Grade[] = [
        Rating.Again,
        Rating.Hard,
        Rating.Good,
        Rating.Easy,
      ];
      const dues = grades.map((r) => preview[r].card.due.getTime());
      expect([...dues].sort((a, b) => a - b)).toEqual(dues);
    }
  });

  it("New card: Again is the 1 min learning step", () => {
    expect(intervalLabels(newRow(), NOW)[1]).toBe("1 min");
  });
});

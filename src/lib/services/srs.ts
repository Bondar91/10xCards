import { z } from "zod";
import {
  fsrs,
  Rating,
  TypeConvert,
  type Card,
  type Grade,
  type ReviewLog,
} from "ts-fsrs";
import type { ReviewRating } from "@/types";

// Pure FSRS helpers: no Supabase/Astro imports so this module stays unit-testable.

export const scheduler = fsrs({ enable_fuzz: true, enable_short_term: true });

export const REVIEW_SESSION_LIMIT = 20;
// Cards due again within this window come back in the same session (Anki's learn-ahead limit).
export const REQUEUE_WINDOW_MS = 20 * 60 * 1000;

export type ReviewGrade = ReviewRating;

// Rating.Manual (0) is not a valid review grade.
export const RatingSchema = z
  .int()
  .min(Rating.Again)
  .max(Rating.Easy)
  .transform((value) => value as ReviewGrade);

/** SRS columns of a `flashcards` row as returned by Supabase (dates as ISO strings). */
export interface SrsRow {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}

export const SRS_COLUMNS =
  "due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review";

export function rowToCard(row: SrsRow): Card {
  return TypeConvert.card({
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review,
  });
}

export function rateCard(
  row: SrsRow,
  rating: ReviewGrade,
  now: Date,
): { card: Card; log: ReviewLog } {
  const { card, log } = scheduler.next(rowToCard(row), now, rating);
  return { card, log };
}

/** New card state as `review_flashcard` RPC parameters. */
export function cardToRpcArgs(card: Card) {
  return {
    p_due: card.due.toISOString(),
    p_stability: card.stability,
    p_difficulty: card.difficulty,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- column kept while on ts-fsrs v5
    p_elapsed_days: card.elapsed_days,
    p_scheduled_days: card.scheduled_days,
    p_learning_steps: card.learning_steps,
    p_reps: card.reps,
    p_lapses: card.lapses,
    p_state: card.state,
    p_last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

/** Review log as the `p_log` JSON object (deprecated elapsed_days fields are not stored). */
export function logToJson(log: ReviewLog) {
  return {
    rating: log.rating,
    state: log.state,
    due: log.due.toISOString(),
    stability: log.stability,
    difficulty: log.difficulty,
    scheduled_days: log.scheduled_days,
    learning_steps: log.learning_steps,
    review: log.review.toISOString(),
  };
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Polish, compact interval label. Thresholds:
 * < 1 min → "<1 min"; < 1 h → "N min"; < 1 day → "N godz.";
 * < 30 days → "1 dzień" / "N dni"; < 365 days → "N mies." (30-day months);
 * otherwise years ("1 rok", "2–4 lata", "N lat").
 * Each unit is rounded, so e.g. 59.6 min shows "60 min".
 */
export function formatInterval(ms: number): string {
  if (ms < MINUTE) return "<1 min";
  if (ms < HOUR) return `${Math.round(ms / MINUTE)} min`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} godz.`;

  const days = ms / DAY;
  if (days < 30) {
    const n = Math.round(days);
    return n === 1 ? "1 dzień" : `${n} dni`;
  }
  if (days < 365) return `${Math.round(days / 30)} mies.`;

  const years = Math.round(days / 365);
  if (years === 1) return "1 rok";
  const lastDigit = years % 10;
  const lastTwo = years % 100;
  const few =
    lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14);
  return `${years} ${few ? "lata" : "lat"}`;
}

export function intervalLabels(
  row: SrsRow,
  now: Date,
): Record<ReviewGrade, string> {
  const preview = scheduler.repeat(rowToCard(row), now);
  const label = (rating: Grade) =>
    formatInterval(preview[rating].card.due.getTime() - now.getTime());
  return {
    1: label(Rating.Again),
    2: label(Rating.Hard),
    3: label(Rating.Good),
    4: label(Rating.Easy),
  };
}

export function cardToRow(card: Card): SrsRow {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- column kept while on ts-fsrs v5
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

export function shouldRequeue(card: Card, now: Date): boolean {
  return card.due.getTime() - now.getTime() <= REQUEUE_WINDOW_MS;
}

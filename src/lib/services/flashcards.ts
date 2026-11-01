// Deck helpers shared by the /api/flashcards routes and the generation flow.
// Must stay free of astro:env imports so vitest can load it.
import { z } from "zod";
import { BACK_MAX_LENGTH, FRONT_MAX_LENGTH } from "@/lib/flashcard-limits";
import type { Tables } from "@/db/database.types";
import type { FlashcardDto, FlashcardSource } from "@/types";

export const FLASHCARDS_PAGE_SIZE = 50;

export const FlashcardContentSchema = z.object({
  front: z.string().trim().min(1).max(FRONT_MAX_LENGTH),
  back: z.string().trim().min(1).max(BACK_MAX_LENGTH),
});

/** `?page=` value: missing → 1, otherwise a positive integer written in digits. */
export const PageQuerySchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1))
  .nullish()
  .transform((page) => page ?? 1);

/** 0-based inclusive range for supabase-js `.range(from, to)`. */
export function pageRange(page: number): { from: number; to: number } {
  const from = (page - 1) * FLASHCARDS_PAGE_SIZE;
  return { from, to: from + FLASHCARDS_PAGE_SIZE - 1 };
}

export type FlashcardRow = Pick<
  Tables<"flashcards">,
  "id" | "front" | "back" | "source" | "created_at"
>;

export function toFlashcardDto(row: FlashcardRow): FlashcardDto {
  return {
    id: row.id,
    front: row.front,
    back: row.back,
    source: row.source as FlashcardSource,
    createdAt: row.created_at,
  };
}

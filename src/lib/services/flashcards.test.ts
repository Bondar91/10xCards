import { describe, expect, it } from "vitest";
import { BACK_MAX_LENGTH, FRONT_MAX_LENGTH } from "@/lib/flashcard-limits";
import {
  FLASHCARDS_PAGE_SIZE,
  FlashcardContentSchema,
  PageQuerySchema,
  pageRange,
  toFlashcardDto,
} from "./flashcards";

describe("PageQuerySchema", () => {
  it("defaults a missing page to 1", () => {
    expect(PageQuerySchema.parse(null)).toBe(1);
    expect(PageQuerySchema.parse(undefined)).toBe(1);
  });

  it("parses positive integers", () => {
    expect(PageQuerySchema.parse("1")).toBe(1);
    expect(PageQuerySchema.parse("2")).toBe(2);
    expect(PageQuerySchema.parse("999")).toBe(999);
  });

  it.each(["0", "-1", "abc", "1.5", "", " 2", "1e3"])("rejects %j", (value) => {
    expect(PageQuerySchema.safeParse(value).success).toBe(false);
  });
});

describe("pageRange", () => {
  it("maps pages to inclusive 0-based ranges", () => {
    expect(FLASHCARDS_PAGE_SIZE).toBe(50);
    expect(pageRange(1)).toEqual({ from: 0, to: 49 });
    expect(pageRange(2)).toEqual({ from: 50, to: 99 });
    expect(pageRange(3)).toEqual({ from: 100, to: 149 });
  });
});

describe("FlashcardContentSchema", () => {
  it("trims front and back", () => {
    expect(
      FlashcardContentSchema.parse({
        front: "  Pytanie ",
        back: "\nOdpowiedź\t",
      }),
    ).toEqual({ front: "Pytanie", back: "Odpowiedź" });
  });

  it.each([
    { front: "", back: "b" },
    { front: "f", back: "" },
    { front: "   ", back: "b" },
    { front: "f", back: " \n\t " },
    { front: "x".repeat(FRONT_MAX_LENGTH + 1), back: "b" },
    { front: "f", back: "x".repeat(BACK_MAX_LENGTH + 1) },
  ])("rejects invalid content %#", (input) => {
    expect(FlashcardContentSchema.safeParse(input).success).toBe(false);
  });

  it("accepts content at the exact limits", () => {
    const input = {
      front: "x".repeat(FRONT_MAX_LENGTH),
      back: "y".repeat(BACK_MAX_LENGTH),
    };
    expect(FlashcardContentSchema.parse(input)).toEqual(input);
  });

  it("measures limits after trimming", () => {
    const front = ` ${"x".repeat(FRONT_MAX_LENGTH)} `;
    expect(FlashcardContentSchema.safeParse({ front, back: "b" }).success).toBe(
      true,
    );
  });
});

describe("toFlashcardDto", () => {
  it("maps a row to the API shape", () => {
    expect(
      toFlashcardDto({
        id: "6f1c1c4e-0000-4000-8000-000000000001",
        front: "F",
        back: "B",
        source: "ai-edited",
        created_at: "2026-11-01T10:00:00+00:00",
      }),
    ).toEqual({
      id: "6f1c1c4e-0000-4000-8000-000000000001",
      front: "F",
      back: "B",
      source: "ai-edited",
      createdAt: "2026-11-01T10:00:00+00:00",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  BACK_MAX_LENGTH,
  FRONT_MAX_LENGTH,
  flashcardDraftState,
} from "./flashcard-limits";
import { FlashcardContentSchema } from "./services/flashcards";

describe("flashcardDraftState", () => {
  it("measures trimmed lengths", () => {
    expect(flashcardDraftState("  Pytanie ", "\nOdp\t")).toEqual({
      frontLength: 7,
      backLength: 3,
      valid: true,
    });
  });

  it("rejects whitespace-only fields", () => {
    expect(flashcardDraftState("   ", "b").valid).toBe(false);
    expect(flashcardDraftState("f", " \n\t ").valid).toBe(false);
  });

  it("accepts content at the exact limits, also with surrounding spaces", () => {
    expect(
      flashcardDraftState(
        ` ${"x".repeat(FRONT_MAX_LENGTH)} `,
        "y".repeat(BACK_MAX_LENGTH),
      ).valid,
    ).toBe(true);
  });

  it("rejects content one over the limits", () => {
    expect(
      flashcardDraftState("x".repeat(FRONT_MAX_LENGTH + 1), "b").valid,
    ).toBe(false);
    expect(
      flashcardDraftState("f", "y".repeat(BACK_MAX_LENGTH + 1)).valid,
    ).toBe(false);
  });

  it.each([
    ["", "b"],
    ["f", ""],
    ["  ", "b"],
    ["f", "b"],
    [" f ", " b "],
    ["x".repeat(FRONT_MAX_LENGTH), "b"],
    ["x".repeat(FRONT_MAX_LENGTH + 1), "b"],
    ["f", "y".repeat(BACK_MAX_LENGTH)],
    ["f", "y".repeat(BACK_MAX_LENGTH + 1)],
    [` ${"x".repeat(FRONT_MAX_LENGTH)} `, "b"],
  ])("agrees with FlashcardContentSchema for %#", (front, back) => {
    expect(flashcardDraftState(front, back).valid).toBe(
      FlashcardContentSchema.safeParse({ front, back }).success,
    );
  });
});

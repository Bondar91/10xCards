// Shared by the API (zod) and the /generate island — must stay free of server-only imports.
export const MIN_INPUT_LENGTH = 1_000;
export const MAX_INPUT_LENGTH = 10_000;
export const MAX_CARDS = 20;
export const FRONT_MAX_LENGTH = 200;
export const BACK_MAX_LENGTH = 500;

export interface FlashcardDraftState {
  frontLength: number;
  backLength: number;
  valid: boolean;
}

/** Client-side mirror of FlashcardContentSchema: lengths and limits apply to trimmed text. */
export function flashcardDraftState(
  front: string,
  back: string,
): FlashcardDraftState {
  const frontLength = front.trim().length;
  const backLength = back.trim().length;
  return {
    frontLength,
    backLength,
    valid:
      frontLength >= 1 &&
      frontLength <= FRONT_MAX_LENGTH &&
      backLength >= 1 &&
      backLength <= BACK_MAX_LENGTH,
  };
}

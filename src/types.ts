export type FlashcardSource = "ai" | "ai-edited" | "manual";

export interface FlashcardProposal {
  front: string;
  back: string;
}

export interface GenerateRequest {
  text: string;
}

export interface GenerateResponse {
  generationId: string;
  cards: FlashcardProposal[];
}

export interface SaveGenerationCard extends FlashcardProposal {
  edited: boolean;
}

export interface SaveGenerationRequest {
  cards: SaveGenerationCard[];
}

export interface SaveGenerationResponse {
  saved: number;
}

export interface ApiError {
  ok: false;
  error: string;
  kind?: string;
}

// --- S-05 review session ---

/** FSRS grade: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type ReviewRating = 1 | 2 | 3 | 4;

export type ReviewIntervals = Record<ReviewRating, string>;

export interface ReviewCardDto {
  id: string;
  front: string;
  back: string;
  reps: number;
  intervals: ReviewIntervals;
}

export interface ReviewQueueResponse {
  cards: ReviewCardDto[];
  dueTotal: number;
  nextDueAt: string | null;
}

export interface SubmitReviewRequest {
  flashcardId: string;
  rating: ReviewRating;
  expectedReps: number;
}

export interface SubmitReviewResponse {
  reps: number;
  intervals: ReviewIntervals;
  requeue: boolean;
}

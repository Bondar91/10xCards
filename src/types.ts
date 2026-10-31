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

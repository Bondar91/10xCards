import { useState } from "react";
import type {
  ApiError,
  FlashcardProposal,
  GenerateResponse,
  SaveGenerationRequest,
  SaveGenerationResponse,
} from "@/types";

export type GenerationStep =
  | "input"
  | "generating"
  | "reviewing"
  | "saving"
  | "saved";

export type ProposalStatus = "pending" | "accepted" | "rejected";

export interface ReviewCard {
  id: number;
  original: FlashcardProposal;
  front: string;
  back: string;
  status: ProposalStatus;
}

export const isEdited = (card: ReviewCard) =>
  card.front.trim() !== card.original.front ||
  card.back.trim() !== card.original.back;

const STATUS_MESSAGES: Partial<Record<number, string>> = {
  400: "Nieprawidłowe dane. Sprawdź tekst i spróbuj ponownie.",
  401: "Sesja wygasła. Zaloguj się ponownie.",
  404: "Nie znaleziono generowania. Wygeneruj fiszki ponownie.",
  409: "Te fiszki zostały już zapisane.",
  422: "Nie udało się wygenerować fiszek z tego tekstu. Spróbuj z innym fragmentem.",
  503: "Usługa AI jest chwilowo niedostępna. Spróbuj za chwilę.",
  504: "Generowanie trwało zbyt długo. Spróbuj ponownie lub skróć tekst.",
};

const FALLBACK_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie.";
const NETWORK_MESSAGE =
  "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.";

type PostResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function postJson<T>(url: string, body: unknown): Promise<PostResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, message: NETWORK_MESSAGE };
  }

  const payload = (await response.json().catch(() => null)) as
    | T
    | ApiError
    | null;
  if (response.ok && payload) {
    return { ok: true, data: payload as T };
  }

  const serverMessage =
    payload && typeof payload === "object" && "error" in payload
      ? payload.error
      : null;
  return {
    ok: false,
    status: response.status,
    message:
      serverMessage ?? STATUS_MESSAGES[response.status] ?? FALLBACK_MESSAGE,
  };
}

export function useFlashcardGeneration() {
  const [step, setStep] = useState<GenerationStep>("input");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  const acceptedCards = cards.filter((card) => card.status === "accepted");

  async function generate() {
    setError(null);
    setStep("generating");

    const result = await postJson<GenerateResponse>("/api/generations", {
      text,
    });
    if (!result.ok) {
      setError(result.message);
      setStep("input");
      return;
    }

    setGenerationId(result.data.generationId);
    setCards(
      result.data.cards.map((card, id) => ({
        id,
        original: card,
        front: card.front,
        back: card.back,
        status: "pending",
      })),
    );
    setStep("reviewing");
  }

  function setStatus(id: number, status: ProposalStatus) {
    setCards((prev) =>
      prev.map((card) => (card.id === id ? { ...card, status } : card)),
    );
  }

  function updateCard(id: number, front: string, back: string) {
    setCards((prev) =>
      prev.map((card) =>
        card.id === id ? { ...card, front, back, status: "accepted" } : card,
      ),
    );
  }

  function acceptRemaining() {
    setCards((prev) =>
      prev.map((card) =>
        card.status === "pending" ? { ...card, status: "accepted" } : card,
      ),
    );
  }

  async function save() {
    if (!generationId) return;
    setError(null);
    setStep("saving");

    const body: SaveGenerationRequest = {
      cards: acceptedCards.map((card) => ({
        front: card.front.trim(),
        back: card.back.trim(),
        edited: isEdited(card),
      })),
    };
    const result = await postJson<SaveGenerationResponse>(
      `/api/generations/${generationId}/save`,
      body,
    );

    if (result.ok) {
      setSavedCount(result.data.saved);
      setStep("saved");
    } else if (result.status === 409) {
      // Already saved (e.g. a retried request) — the cards are in the deck.
      setSavedCount(body.cards.length);
      setStep("saved");
    } else {
      setError(result.message);
      setStep("reviewing");
    }
  }

  function reset() {
    setStep("input");
    setText("");
    setError(null);
    setGenerationId(null);
    setCards([]);
    setSavedCount(0);
  }

  return {
    step,
    text,
    setText,
    error,
    cards,
    acceptedCount: acceptedCards.length,
    savedCount,
    generate,
    accept: (id: number) => {
      setStatus(id, "accepted");
    },
    reject: (id: number) => {
      setStatus(id, "rejected");
    },
    undo: (id: number) => {
      setStatus(id, "pending");
    },
    updateCard,
    acceptRemaining,
    save,
    reset,
  };
}

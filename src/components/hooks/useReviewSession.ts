import { useEffect, useRef, useState } from "react";
import type {
  ApiError,
  ReviewCardDto,
  ReviewQueueResponse,
  ReviewRating,
  SubmitReviewRequest,
  SubmitReviewResponse,
} from "@/types";

export type ReviewStep =
  | "loading"
  | "question"
  | "answer"
  | "submitting"
  | "finished"
  | "empty"
  | "error";

// 409 (stale rating) is handled silently and never shown.
const STATUS_MESSAGES: Partial<Record<number, string>> = {
  400: "Nieprawidłowa ocena. Spróbuj ponownie.",
  401: "Sesja wygasła. Zaloguj się ponownie.",
  404: "Nie znaleziono fiszki.",
  503: "Baza danych jest chwilowo niedostępna. Spróbuj za chwilę.",
};

const FALLBACK_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie.";
const NETWORK_MESSAGE =
  "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.";

type RequestResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<RequestResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
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

const postJson = <T>(url: string, body: unknown) =>
  requestJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const fetchQueue = () => requestJson<ReviewQueueResponse>("/api/reviews/queue");

export function useReviewSession() {
  const [step, setStep] = useState<ReviewStep>("loading");
  const [queue, setQueue] = useState<ReviewCardDto[]>([]);
  const [ratedCount, setRatedCount] = useState(0);
  const [dueTotal, setDueTotal] = useState(0);
  // Unique cards in the current batch — re-ratings of re-queued cards don't count.
  const [batchSize, setBatchSize] = useState(0);
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRating, setPendingRating] = useState<ReviewRating | null>(null);
  // Synchronous guard: state updates are async, so a double click would otherwise send twice.
  const submittingRef = useRef(false);

  function applyQueue(result: RequestResult<ReviewQueueResponse>) {
    if (!result.ok) {
      setError(result.message);
      setStep("error");
      return;
    }

    const { cards, dueTotal: total, nextDueAt: next } = result.data;
    setQueue(cards);
    setDueTotal(total);
    setBatchSize(cards.length);
    setNextDueAt(next);
    setError(null);
    setStep(cards.length > 0 ? "question" : "empty");
  }

  useEffect(() => {
    let cancelled = false;
    void fetchQueue().then((result) => {
      if (!cancelled) applyQueue(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function advance(rest: ReviewCardDto[]) {
    setQueue(rest);
    setStep(rest.length > 0 ? "question" : "finished");
  }

  async function rate(rating: ReviewRating) {
    const card = queue.at(0);
    if (!card || step !== "answer" || submittingRef.current) return;

    submittingRef.current = true;
    setPendingRating(rating);
    setError(null);
    setStep("submitting");

    const body: SubmitReviewRequest = {
      flashcardId: card.id,
      rating,
      expectedReps: card.reps,
    };
    const result = await postJson<SubmitReviewResponse>("/api/reviews", body);

    submittingRef.current = false;
    setPendingRating(null);

    const rest = queue.slice(1);
    if (result.ok) {
      setRatedCount((n) => n + 1);
      const { reps, intervals, requeue } = result.data;
      // The next rating of a re-queued card must use the reps returned now.
      advance(requeue ? [...rest, { ...card, reps, intervals }] : rest);
    } else if (result.status === 409) {
      // Already rated (double click, retry, other tab) — move on silently.
      advance(rest);
    } else {
      setError(result.message);
      setStep("answer");
    }
  }

  function continueSession() {
    setStep("loading");
    setError(null);
    void fetchQueue().then(applyQueue);
  }

  return {
    step,
    current: queue.at(0) ?? null,
    queueLength: queue.length,
    ratedCount,
    remaining: Math.max(dueTotal - batchSize, 0),
    nextDueAt,
    error,
    pendingRating,
    reveal: () => {
      if (step === "question") setStep("answer");
    },
    rate,
    continueSession,
  };
}

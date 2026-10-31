import { useEffect, useRef, useState } from "react";
import {
  postJson,
  requestJson,
  type RequestResult,
  type StatusMessages,
} from "@/lib/request-json";
import type {
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
const STATUS_MESSAGES: StatusMessages = {
  400: "Nieprawidłowa ocena. Spróbuj ponownie.",
  401: "Sesja wygasła. Zaloguj się ponownie.",
  404: "Nie znaleziono fiszki.",
  503: "Baza danych jest chwilowo niedostępna. Spróbuj za chwilę.",
};

const fetchQueue = () =>
  requestJson<ReviewQueueResponse>("/api/reviews/queue", STATUS_MESSAGES);

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
    const result = await postJson<SubmitReviewResponse>(
      "/api/reviews",
      body,
      STATUS_MESSAGES,
    );

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
    // Estimate from the batch's queue response: ignores ratings made in other tabs and
    // cards that became due mid-session; "Kontynuuj" re-fetches and handles an empty result.
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

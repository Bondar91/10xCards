import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { bodyTooLarge, json, jsonError } from "@/lib/api-response";
import {
  cardToRow,
  cardToRpcArgs,
  intervalLabels,
  logToJson,
  rateCard,
  RatingSchema,
  shouldRequeue,
  SRS_COLUMNS,
} from "@/lib/services/srs";
import type { SubmitReviewResponse } from "@/types";

export const prerender = false;

const SubmitReviewSchema = z.object({
  flashcardId: z.uuid(),
  rating: RatingSchema,
  expectedReps: z.int().min(0),
});

const STALE_MESSAGE = "Ta fiszka została już oceniona.";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("Wymagane logowanie.", 401);
  }

  if (bodyTooLarge(context.request)) {
    return jsonError("Żądanie jest zbyt duże.", 413, "validation");
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("Nieprawidłowe żądanie.", 400, "validation");
  }

  const parsed = SubmitReviewSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Nieprawidłowa ocena.", 400, "validation");
  }
  const { flashcardId, rating, expectedReps } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Baza danych nie jest skonfigurowana.", 503, "config");
  }

  // RLS limits this to the caller's own cards.
  const { data: row, error: loadError } = await supabase
    .from("flashcards")
    .select(SRS_COLUMNS)
    .eq("id", flashcardId)
    .maybeSingle();

  if (loadError) {
    // eslint-disable-next-line no-console
    console.error("load flashcard failed", { code: loadError.code });
    return jsonError("Nie udało się zapisać oceny. Spróbuj ponownie.", 500);
  }
  if (!row) {
    return jsonError("Nie znaleziono fiszki.", 404, "not_found");
  }
  if (row.reps !== expectedReps) {
    return jsonError(STALE_MESSAGE, 409, "stale_review");
  }

  const now = new Date();
  let result: ReturnType<typeof rateCard>;
  let response: SubmitReviewResponse;
  try {
    result = rateCard(row, rating, now);
    // Computed before the write so nothing can throw after the rating is committed.
    response = {
      reps: result.card.reps,
      intervals: intervalLabels(cardToRow(result.card), now),
      requeue: shouldRequeue(result.card, now),
    };
  } catch (e) {
    // FSRSValidationError is not exported from ts-fsrs v5 — treat any throw as 500.
    // eslint-disable-next-line no-console
    console.error("rateCard failed", {
      name: e instanceof Error ? e.name : "unknown",
    });
    return jsonError("Nie udało się zapisać oceny. Spróbuj ponownie.", 500);
  }
  const { card, log } = result;

  const { error } = await supabase.rpc("review_flashcard", {
    p_flashcard_id: flashcardId,
    p_expected_reps: expectedReps,
    ...cardToRpcArgs(card),
    // next() always stamps last_review = now; the generated type is non-null.
    p_last_review: (card.last_review ?? now).toISOString(),
    p_log: logToJson(log),
  });

  if (error) {
    switch (error.code) {
      case "RV404":
        return jsonError("Nie znaleziono fiszki.", 404, "not_found");
      case "RV409":
        return jsonError(STALE_MESSAGE, 409, "stale_review");
      case "22023":
        return jsonError("Nieprawidłowa ocena.", 400, "validation");
      default:
        // eslint-disable-next-line no-console
        console.error("review_flashcard failed", { code: error.code });
        return jsonError("Nie udało się zapisać oceny. Spróbuj ponownie.", 500);
    }
  }

  return json(response, 200);
};

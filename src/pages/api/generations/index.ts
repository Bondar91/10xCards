import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { json, jsonError } from "@/lib/api-response";
import {
  generateFlashcards,
  MAX_INPUT_LENGTH,
  MIN_INPUT_LENGTH,
} from "@/lib/services/flashcard-generator";
import type { AiErrorKind } from "@/lib/services/ai-client";
import type { GenerateResponse } from "@/types";

export const prerender = false;

const GenerateSchema = z.object({
  text: z.string().trim().min(MIN_INPUT_LENGTH).max(MAX_INPUT_LENGTH),
});

const ERRORS: Record<
  AiErrorKind | "no_cards",
  { status: number; message: string }
> = {
  config: { status: 503, message: "Usługa AI nie jest skonfigurowana." },
  rate_limit: {
    status: 503,
    message: "Usługa AI jest chwilowo niedostępna. Spróbuj za chwilę.",
  },
  upstream: {
    status: 503,
    message: "Usługa AI jest chwilowo niedostępna. Spróbuj za chwilę.",
  },
  timeout: {
    status: 504,
    message: "Generowanie trwało zbyt długo. Spróbuj ponownie lub skróć tekst.",
  },
  no_cards: {
    status: 422,
    message:
      "Nie udało się wygenerować fiszek z tego tekstu. Spróbuj z innym fragmentem.",
  },
};

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("Wymagane logowanie.", 401);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("Nieprawidłowe żądanie.", 400, "validation");
  }

  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "Tekst musi mieć od 1 000 do 10 000 znaków.",
      400,
      "validation",
    );
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Baza danych nie jest skonfigurowana.", 503, "config");
  }

  const { text } = parsed.data;
  const result = await generateFlashcards(text);
  if (!result.ok) {
    const { status, message } = ERRORS[result.kind];
    return jsonError(message, status, result.kind);
  }

  const { data, error } = await supabase
    .from("generations")
    .insert({
      model: result.model,
      input_length: text.length,
      generated_count: result.cards.length,
    })
    .select("id")
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("generations insert failed", { code: error.code });
    return jsonError(
      "Nie udało się zapisać generowania. Spróbuj ponownie.",
      500,
    );
  }

  return json(
    { generationId: data.id, cards: result.cards } satisfies GenerateResponse,
    200,
  );
};

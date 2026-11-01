import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { bodyTooLarge, json, jsonError } from "@/lib/api-response";
import {
  FlashcardContentSchema,
  toFlashcardDto,
} from "@/lib/services/flashcards";
import type { UpdateFlashcardResponse } from "@/types";

export const prerender = false;

const IdSchema = z.uuid();

const NOT_FOUND = "Nie znaleziono fiszki.";
const INVALID_CONTENT = "Nieprawidłowa treść fiszki.";

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("Wymagane logowanie.", 401);
  }

  const id = IdSchema.safeParse(context.params.id);
  if (!id.success) {
    return jsonError("Nieprawidłowy identyfikator fiszki.", 400, "validation");
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

  const parsed = FlashcardContentSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(INVALID_CONTENT, 400, "validation");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Baza danych nie jest skonfigurowana.", 503, "config");
  }

  const { data, error } = await supabase.rpc("update_flashcard_content", {
    p_flashcard_id: id.data,
    p_front: parsed.data.front,
    p_back: parsed.data.back,
  });

  if (error) {
    switch (error.code) {
      case "FC404":
        return jsonError(NOT_FOUND, 404, "not_found");
      case "22023":
      case "23514":
        return jsonError(INVALID_CONTENT, 400, "validation");
      default:
        // eslint-disable-next-line no-console
        console.error("update_flashcard_content failed", { code: error.code });
        return jsonError(
          "Nie udało się zapisać fiszki. Spróbuj ponownie.",
          500,
        );
    }
  }

  return json(
    { card: toFlashcardDto(data) } satisfies UpdateFlashcardResponse,
    200,
  );
};

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("Wymagane logowanie.", 401);
  }

  const id = IdSchema.safeParse(context.params.id);
  if (!id.success) {
    return jsonError("Nieprawidłowy identyfikator fiszki.", 400, "validation");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Baza danych nie jest skonfigurowana.", 503, "config");
  }

  // RLS (flashcards_delete_own) hides other users' cards, so they count as missing.
  const { data, error } = await supabase
    .from("flashcards")
    .delete()
    .eq("id", id.data)
    .select("id");

  if (error) {
    // eslint-disable-next-line no-console
    console.error("flashcard delete failed", { code: error.code });
    return jsonError("Nie udało się usunąć fiszki. Spróbuj ponownie.", 500);
  }

  if (data.length === 0) {
    return jsonError(NOT_FOUND, 404, "not_found");
  }

  return json({ deleted: true }, 200);
};

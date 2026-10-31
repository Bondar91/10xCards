import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { bodyTooLarge, json, jsonError } from "@/lib/api-response";
import { ProposalSchema } from "@/lib/services/flashcard-generator";
import { MAX_CARDS } from "@/lib/flashcard-limits";
import type { SaveGenerationResponse } from "@/types";

export const prerender = false;

const IdSchema = z.uuid();

const SaveSchema = z.object({
  cards: z.array(ProposalSchema.extend({ edited: z.boolean() })).max(MAX_CARDS),
});

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("Wymagane logowanie.", 401);
  }

  const id = IdSchema.safeParse(context.params.id);
  if (!id.success) {
    return jsonError(
      "Nieprawidłowy identyfikator generowania.",
      400,
      "validation",
    );
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

  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Nieprawidłowe fiszki do zapisania.", 400, "validation");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Baza danych nie jest skonfigurowana.", 503, "config");
  }

  const { data, error } = await supabase.rpc("save_generation", {
    p_generation_id: id.data,
    p_cards: parsed.data.cards,
  });

  if (error) {
    switch (error.code) {
      case "GN404":
        return jsonError("Nie znaleziono generowania.", 404, "not_found");
      case "GN409":
        return jsonError(
          "Te fiszki zostały już zapisane.",
          409,
          "already_saved",
        );
      case "22023":
        return jsonError(
          "Nieprawidłowe fiszki do zapisania.",
          400,
          "validation",
        );
      default:
        // eslint-disable-next-line no-console
        console.error("save_generation failed", { code: error.code });
        return jsonError(
          "Nie udało się zapisać fiszek. Spróbuj ponownie.",
          500,
        );
    }
  }

  return json({ saved: data } satisfies SaveGenerationResponse, 200);
};

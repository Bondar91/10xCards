import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { json, jsonError } from "@/lib/api-response";
import {
  FLASHCARDS_PAGE_SIZE,
  PageQuerySchema,
  pageRange,
  toFlashcardDto,
} from "@/lib/services/flashcards";
import type { FlashcardListResponse } from "@/types";

export const prerender = false;

const LOAD_ERROR = "Nie udało się wczytać fiszek.";

// PostgREST answers 416 / PGRST103 when the offset is past the total row count.
const RANGE_NOT_SATISFIABLE = "PGRST103";

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("Wymagane logowanie.", 401);
  }

  const page = PageQuerySchema.safeParse(context.url.searchParams.get("page"));
  if (!page.success) {
    return jsonError("Nieprawidłowy numer strony.", 400, "validation");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Baza danych nie jest skonfigurowana.", 503, "config");
  }

  const { from, to } = pageRange(page.data);

  // RLS limits this to the caller's own cards.
  const { data, count, error } = await supabase
    .from("flashcards")
    .select("id, front, back, source, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error) {
    if (error.code !== RANGE_NOT_SATISFIABLE) {
      // eslint-disable-next-line no-console
      console.error("flashcards list failed", { code: error.code });
      return jsonError(LOAD_ERROR, 500);
    }

    const { count: total, error: countError } = await supabase
      .from("flashcards")
      .select("id", { count: "exact", head: true });

    if (countError) {
      // eslint-disable-next-line no-console
      console.error("flashcards count failed", { code: countError.code });
      return jsonError(LOAD_ERROR, 500);
    }

    return json(
      {
        cards: [],
        total: total ?? 0,
        page: page.data,
        pageSize: FLASHCARDS_PAGE_SIZE,
      } satisfies FlashcardListResponse,
      200,
    );
  }

  return json(
    {
      cards: data.map(toFlashcardDto),
      total: count ?? 0,
      page: page.data,
      pageSize: FLASHCARDS_PAGE_SIZE,
    } satisfies FlashcardListResponse,
    200,
  );
};

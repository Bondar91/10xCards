import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { bodyTooLarge, json, jsonError } from "@/lib/api-response";
import {
  FLASHCARDS_PAGE_SIZE,
  FlashcardContentSchema,
  PageQuerySchema,
  pageRange,
  toFlashcardDto,
} from "@/lib/services/flashcards";
import type { CreateFlashcardResponse, FlashcardListResponse } from "@/types";

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

const INVALID_CONTENT = "Nieprawidłowa treść fiszki.";

// CHECK violation (front/back length) — the zod schema should catch it first.
const CHECK_VIOLATION = "23514";

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

  const parsed = FlashcardContentSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(INVALID_CONTENT, 400, "validation");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Baza danych nie jest skonfigurowana.", 503, "config");
  }

  // user_id defaults to auth.uid(); flashcards_insert_own only admits source = 'manual'
  // with no generation_id, so the caller cannot forge AI cards or write for someone else.
  const { data, error } = await supabase
    .from("flashcards")
    .insert({
      front: parsed.data.front,
      back: parsed.data.back,
      source: "manual",
    })
    .select("id, front, back, source, created_at")
    .single();

  if (error) {
    if (error.code === CHECK_VIOLATION) {
      return jsonError(INVALID_CONTENT, 400, "validation");
    }
    // eslint-disable-next-line no-console
    console.error("flashcard create failed", { code: error.code });
    return jsonError("Nie udało się dodać fiszki. Spróbuj ponownie.", 500);
  }

  return json(
    { card: toFlashcardDto(data) } satisfies CreateFlashcardResponse,
    201,
  );
};

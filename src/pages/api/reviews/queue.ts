import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { json, jsonError } from "@/lib/api-response";
import { intervalLabels, REVIEW_SESSION_LIMIT } from "@/lib/services/srs";
import type { ReviewCardDto, ReviewQueueResponse } from "@/types";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return jsonError("Wymagane logowanie.", 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Baza danych nie jest skonfigurowana.", 503, "config");
  }

  const { data: rows, error } = await supabase.rpc("get_review_queue", {
    p_limit: REVIEW_SESSION_LIMIT,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error("get_review_queue failed", { code: error.code });
    return jsonError("Nie udało się wczytać powtórek.", 500);
  }

  // One `now` for every label in the response.
  const now = new Date();

  let cards: ReviewCardDto[];
  try {
    cards = rows.map((row) => ({
      id: row.id,
      front: row.front,
      back: row.back,
      reps: row.reps,
      intervals: intervalLabels(row, now),
    }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("intervalLabels failed", {
      name: e instanceof Error ? e.name : "unknown",
    });
    return jsonError("Nie udało się wczytać powtórek.", 500);
  }

  let nextDueAt: string | null = null;
  if (cards.length === 0) {
    const { data: next, error: nextError } = await supabase
      .from("flashcards")
      .select("due")
      .eq("user_id", user.id)
      .gt("due", now.toISOString())
      .order("due", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextError) {
      // eslint-disable-next-line no-console
      console.error("next due lookup failed", { code: nextError.code });
      return jsonError("Nie udało się wczytać powtórek.", 500);
    }
    nextDueAt = next?.due ?? null;
  }

  return json(
    {
      cards,
      dueTotal: rows[0]?.due_total ?? 0,
      nextDueAt,
    } satisfies ReviewQueueResponse,
    200,
  );
};

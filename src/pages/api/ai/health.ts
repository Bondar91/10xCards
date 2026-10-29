import type { APIRoute } from "astro";
import { chatCompletion, type AiErrorKind } from "@/lib/services/ai-client";

export const prerender = false;

// Fixed prompt: the health check never sends user text to the provider.
const HEALTH_PROMPT = [
  {
    role: "system",
    content: "You are a health check. Follow the instruction exactly.",
  },
  { role: "user", content: "Reply with exactly: OK" },
] as const;

const ERROR_STATUS: Record<AiErrorKind, number> = {
  config: 503,
  rate_limit: 503,
  upstream: 503,
  timeout: 504,
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return json({ ok: false, error: "Wymagane logowanie." }, 401);
  }

  const result = await chatCompletion([...HEALTH_PROMPT], { maxTokens: 32 });

  if (!result.ok) {
    const error =
      result.kind === "config"
        ? "Usługa AI nie jest skonfigurowana."
        : "Usługa AI jest chwilowo niedostępna.";
    return json(
      { ok: false, kind: result.kind, error },
      ERROR_STATUS[result.kind],
    );
  }

  return json(
    { ok: true, model: result.model, latencyMs: result.latencyMs },
    200,
  );
};

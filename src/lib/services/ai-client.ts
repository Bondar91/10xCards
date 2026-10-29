import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "astro:env/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 25_000;

// Sent on every request: route only to Zero Data Retention endpoints of providers
// that do not store prompts, and never fall back outside that set (PRD NFR: AI privacy).
const PRIVACY_ROUTING = {
  zdr: true,
  data_collection: "deny",
  allow_fallbacks: false,
} as const;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AiErrorKind = "config" | "timeout" | "rate_limit" | "upstream";

export type ChatResult =
  | { ok: true; content: string; model: string; latencyMs: number }
  | { ok: false; kind: AiErrorKind; status?: number; latencyMs: number };

interface ChatCompletionResponse {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<ChatResult> {
  const startedAt = Date.now();
  const fail = (kind: AiErrorKind, status?: number): ChatResult => {
    const latencyMs = Date.now() - startedAt;
    // Never log messages or response bodies — submitted text must leave no trace.
    // eslint-disable-next-line no-console
    console.error("ai-client error", {
      kind,
      status,
      model: OPENROUTER_MODEL,
      latencyMs,
    });
    return { ok: false, kind, status, latencyMs };
  };

  if (!OPENROUTER_API_KEY) {
    return fail("config");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        max_tokens: options.maxTokens,
        provider: PRIVACY_ROUTING,
      }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      return fail("rate_limit", response.status);
    }
    if (!response.ok) {
      return fail("upstream", response.status);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return fail("upstream", response.status);
    }

    return {
      ok: true,
      content,
      model: data.model ?? OPENROUTER_MODEL,
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return fail(controller.signal.aborted ? "timeout" : "upstream");
  } finally {
    clearTimeout(timeout);
  }
}

import type { ApiError } from "@/types";

const FALLBACK_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie.";
const NETWORK_MESSAGE =
  "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.";

export type StatusMessages = Partial<Record<number, string>>;

export type RequestResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

/**
 * Fetch JSON from an API route. Error message priority: server `error` field,
 * then `statusMessages[status]`, then a generic fallback. Network failure → status 0.
 */
export async function requestJson<T>(
  url: string,
  statusMessages: StatusMessages,
  init?: RequestInit,
): Promise<RequestResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, message: NETWORK_MESSAGE };
  }

  const payload = (await response.json().catch(() => null)) as
    | T
    | ApiError
    | null;
  if (response.ok && payload) {
    return { ok: true, data: payload as T };
  }

  const serverMessage =
    payload && typeof payload === "object" && "error" in payload
      ? payload.error
      : null;
  return {
    ok: false,
    status: response.status,
    message:
      serverMessage ?? statusMessages[response.status] ?? FALLBACK_MESSAGE,
  };
}

export const postJson = <T>(
  url: string,
  body: unknown,
  statusMessages: StatusMessages,
) =>
  requestJson<T>(url, statusMessages, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

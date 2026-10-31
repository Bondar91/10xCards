import type { ApiError } from "@/types";

export const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const jsonError = (error: string, status: number, kind?: string) =>
  json({ ok: false, error, kind } satisfies ApiError, status);

// 10,000 chars of text (or 20 cards) stay well under this even as UTF-8 JSON.
const MAX_BODY_BYTES = 64 * 1024;

// Reject oversized bodies before request.json() spends CPU parsing them.
export const bodyTooLarge = (request: Request) =>
  Number(request.headers.get("Content-Length") ?? 0) > MAX_BODY_BYTES;

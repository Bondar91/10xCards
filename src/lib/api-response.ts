import type { ApiError } from "@/types";

export const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const jsonError = (error: string, status: number, kind?: string) =>
  json({ ok: false, error, kind } satisfies ApiError, status);

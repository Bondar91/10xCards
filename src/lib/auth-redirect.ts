const DEFAULT_REDIRECT = "/dashboard";

/**
 * Turns an untrusted `next` value into a same-origin path.
 * Rejects protocol-relative (`//`), backslash (`/\`, browsers treat it as `//`),
 * schemes, whitespace and control characters — anything else falls back to /dashboard.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw?.startsWith("/") || raw.startsWith("//")) {
    return DEFAULT_REDIRECT;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\\\s\x00-\x1f\x7f]/.test(raw)) {
    return DEFAULT_REDIRECT;
  }
  return raw;
}

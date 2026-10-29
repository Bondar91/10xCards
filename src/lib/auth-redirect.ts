const DEFAULT_REDIRECT = "/dashboard";

// States shown on /auth/confirm-email; unknown values fall back to "sent".
export const CONFIRM_REASONS = [
  "sent",
  "unconfirmed",
  "expired",
  "resent",
] as const;
export type ConfirmReason = (typeof CONFIRM_REASONS)[number];

export function parseConfirmReason(
  raw: string | null | undefined,
): ConfirmReason {
  return CONFIRM_REASONS.find((reason) => reason === raw) ?? "sent";
}

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

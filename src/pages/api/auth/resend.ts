import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { parseConfirmReason } from "@/lib/auth-redirect";

export const prerender = false;

const RATE_LIMIT_CODES = [
  "over_email_send_rate_limit",
  "over_request_rate_limit",
];

const ResendSchema = z.object({
  email: z.email(),
});

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const rawReason = form.get("reason");
  const reason = parseConfirmReason(
    typeof rawReason === "string" ? rawReason : null,
  );

  const fail = (message: string) => {
    const params = new URLSearchParams({ reason, error: message });
    return context.redirect(`/auth/confirm-email?${params.toString()}`);
  };

  const parsed = ResendSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) {
    return fail("Podaj prawidłowy adres e-mail.");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Usługa rejestracji nie jest skonfigurowana.");
  }
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
  });

  // Only rate limits are surfaced; any other outcome looks the same so the address's existence is not revealed.
  if (error?.code && RATE_LIMIT_CODES.includes(error.code)) {
    return fail(authErrorMessage(error));
  }

  return context.redirect("/auth/confirm-email?reason=resent");
};

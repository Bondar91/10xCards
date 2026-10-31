import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

// token_hash flow needs no code_verifier cookie, so the link works on any device.
const ConfirmSchema = z.object({
  token_hash: z.string().min(1),
  type: z.enum(["email", "signup"]),
});

export const GET: APIRoute = async (context) => {
  const expired = () => context.redirect("/auth/confirm-email?reason=expired");

  const parsed = ConfirmSchema.safeParse({
    token_hash: context.url.searchParams.get("token_hash"),
    type: context.url.searchParams.get("type"),
  });
  if (!parsed.success) {
    return expired();
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return expired();
  }
  const { error } = await supabase.auth.verifyOtp(parsed.data);

  if (error) {
    // Expired/used links are expected; anything else is an outage worth seeing in wrangler tail.
    if (error.code !== "otp_expired") {
      // eslint-disable-next-line no-console
      console.error("verifyOtp failed", error.code ?? error.status);
    }
    return expired();
  }

  return context.redirect("/dashboard");
};

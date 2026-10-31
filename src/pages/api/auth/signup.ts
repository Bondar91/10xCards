import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-rules";

export const prerender = false;

const SignUpSchema = z.object({
  email: z.email(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
});

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const fail = (message: string) =>
    context.redirect(`/auth/signup?error=${encodeURIComponent(message)}`);

  const parsed = SignUpSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) {
    return fail(
      `Podaj prawidłowy e-mail i hasło (min. ${String(MIN_PASSWORD_LENGTH)} znaków).`,
    );
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Usługa rejestracji nie jest skonfigurowana.");
  }
  const { data, error } = await supabase.auth.signUp(parsed.data);

  if (error) {
    return fail(authErrorMessage(error));
  }

  // Confirmations off (local Supabase) → signUp returns a session right away.
  if (data.session) {
    return context.redirect("/dashboard");
  }

  return context.redirect("/auth/confirm-email");
};

import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { safeNext } from "@/lib/auth-redirect";

export const prerender = false;

const SignInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const rawNext = form.get("next");
  const next = typeof rawNext === "string" && rawNext ? rawNext : null;

  const fail = (message: string) => {
    const params = new URLSearchParams({ error: message });
    if (next) params.set("next", next);
    return context.redirect(`/auth/signin?${params.toString()}`);
  };

  const parsed = SignInSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) {
    return fail("Podaj prawidłowy e-mail i hasło.");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Usługa logowania nie jest skonfigurowana.");
  }
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error?.code === "email_not_confirmed") {
    return context.redirect("/auth/confirm-email?reason=unconfirmed");
  }

  if (error) {
    return fail(authErrorMessage(error));
  }

  return context.redirect(safeNext(next));
};

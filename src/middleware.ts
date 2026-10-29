import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

// Default-deny: everything outside this allowlist requires a signed-in user.
const PUBLIC_EXACT = ["/"];
const PUBLIC_PREFIXES = ["/auth", "/api/auth"];

// Signed-in users have nothing to do here; /auth/confirm is deliberately absent.
const GUEST_ONLY_ROUTES = [
  "/auth/signin",
  "/auth/signup",
  "/auth/confirm-email",
];

// Segment-aware: "/auth" matches "/auth" and "/auth/x", not "/authx".
const matchesPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const isPublic = (pathname: string) =>
  PUBLIC_EXACT.includes(pathname) ||
  PUBLIC_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  const { pathname, search } = context.url;

  if (context.locals.user) {
    if (GUEST_ONLY_ROUTES.includes(pathname)) {
      return context.redirect("/dashboard");
    }
    return next();
  }

  if (isPublic(pathname)) {
    return next();
  }

  if (matchesPrefix(pathname, "/api")) {
    return new Response(
      JSON.stringify({ ok: false, error: "Wymagane logowanie." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return context.redirect(
    `/auth/signin?next=${encodeURIComponent(pathname + search)}`,
  );
});

import React, { useState } from "react";
import { Mail, Send } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import type { ConfirmReason } from "@/lib/auth-redirect";

interface Props {
  reason: ConfirmReason;
  serverError?: string | null;
}

export default function ResendConfirmationForm({ reason, serverError }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!email.trim()) {
      setError("Adres e-mail jest wymagany");
      e.preventDefault();
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Podaj prawidłowy adres e-mail");
      e.preventDefault();
    }
  }

  return (
    <form
      method="POST"
      action="/api/auth/resend"
      className="space-y-4 text-left"
      onSubmit={handleSubmit}
      noValidate
    >
      <input type="hidden" name="reason" value={reason} />
      <FormField
        id="email"
        type="email"
        label="E-mail"
        value={email}
        onChange={(v) => {
          setEmail(v);
          setError(undefined);
        }}
        placeholder="ty@przyklad.pl"
        error={error}
        icon={<Mail className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton
        pendingText="Wysyłanie..."
        icon={<Send className="size-4" />}
      >
        Wyślij link ponownie
      </SubmitButton>
    </form>
  );
}

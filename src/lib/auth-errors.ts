const DEFAULT_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie.";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Nieprawidłowy e-mail lub hasło.",
  email_not_confirmed: "Adres e-mail nie został jeszcze potwierdzony.",
  user_already_exists: "Konto z tym adresem e-mail już istnieje.",
  weak_password: "Hasło jest zbyt słabe. Użyj dłuższego hasła.",
  email_address_invalid: "Podaj prawidłowy adres e-mail.",
  over_email_send_rate_limit:
    "Wysłano zbyt wiele e-maili. Spróbuj ponownie za kilka minut.",
  over_request_rate_limit: "Zbyt wiele prób. Spróbuj ponownie za chwilę.",
  otp_expired: "Link wygasł lub został już użyty.",
};

// Maps Supabase auth errors to Polish UI messages; raw provider text never reaches the UI.
export function authErrorMessage(
  error: { code?: string } | null | undefined,
): string {
  return (error?.code && MESSAGES[error.code]) ?? DEFAULT_MESSAGE;
}

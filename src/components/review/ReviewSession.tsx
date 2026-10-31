import { useEffect } from "react";
import { Eye, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { RatingButtons } from "@/components/review/RatingButtons";
import { useReviewSession } from "@/components/hooks/useReviewSession";
import { cn } from "@/lib/utils";
import type { ReviewRating } from "@/types";

const primaryButton =
  "rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500";
const secondaryButton =
  "rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white transition-colors hover:bg-white/20";
const cardFace =
  "rounded-xl border border-white/10 bg-white/5 px-5 py-6 text-center whitespace-pre-wrap break-words";

const formatDueDate = (iso: string) =>
  new Date(iso).toLocaleString("pl-PL", {
    dateStyle: "long",
    timeStyle: "short",
  });

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export default function ReviewSession() {
  const session = useReviewSession();
  const { step, reveal, rate } = session;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isEditable(e.target)) return;

      if (step === "question" && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        reveal();
      } else if (step === "answer" && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        void rate(Number(e.key) as ReviewRating);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [step, reveal, rate]);

  if (step === "loading") {
    return (
      <div className="flex justify-center py-12">
        <span className="size-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="space-y-4">
        <ServerError message={session.error} />
        <Button className={primaryButton} onClick={session.continueSession}>
          Spróbuj ponownie
        </Button>
      </div>
    );
  }

  if (step === "empty") {
    return (
      <div className="space-y-6 text-center">
        {session.nextDueAt ? (
          <>
            <p className="text-xl font-semibold text-white">
              Brak fiszek do powtórki
            </p>
            <p className="text-blue-100/80">
              Następna powtórka: {formatDueDate(session.nextDueAt)}
            </p>
            <a
              href="/dashboard"
              className={cn(secondaryButton, "inline-block")}
            >
              Wróć do panelu
            </a>
          </>
        ) : (
          <>
            <p className="text-xl font-semibold text-white">
              Brak fiszek — wygeneruj pierwsze
            </p>
            <a
              href="/generate"
              className={cn(primaryButton, "inline-flex items-center gap-2")}
            >
              <Sparkles className="size-4" /> Generuj fiszki
            </a>
          </>
        )}
      </div>
    );
  }

  if (step === "finished") {
    return (
      <div className="space-y-6 text-center">
        <p className="text-xl font-semibold text-white">Sesja zakończona</p>
        <p className="text-blue-100/80">Ocenione: {session.ratedCount}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href="/dashboard" className={secondaryButton}>
            Wróć do panelu
          </a>
          {session.remaining > 0 && (
            <Button className={primaryButton} onClick={session.continueSession}>
              <Play /> Kontynuuj ({session.remaining} zostało)
            </Button>
          )}
        </div>
      </div>
    );
  }

  const card = session.current;
  if (!card) return null;
  const showAnswer = step === "answer" || step === "submitting";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-blue-100/80">
        <span>Ocenione: {session.ratedCount}</span>
        <span>·</span>
        <span>W kolejce: {session.queueLength}</span>
      </div>

      <div className={cn(cardFace, "text-lg font-medium text-white")}>
        {card.front}
      </div>

      {showAnswer ? (
        <>
          <div className={cn(cardFace, "text-blue-50")}>{card.back}</div>
          <ServerError message={session.error} />
          <RatingButtons
            intervals={card.intervals}
            disabled={step === "submitting"}
            pendingRating={session.pendingRating}
            onRate={(rating) => void rate(rating)}
          />
        </>
      ) : (
        <Button
          className={cn(primaryButton, "w-full")}
          aria-keyshortcuts="Space Enter"
          onClick={reveal}
        >
          <Eye /> Pokaż odpowiedź
        </Button>
      )}
    </div>
  );
}

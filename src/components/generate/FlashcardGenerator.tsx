import { CheckCheck, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { GenerationProgress } from "@/components/generate/GenerationProgress";
import { ProposalCard } from "@/components/generate/ProposalCard";
import { useFlashcardGeneration } from "@/components/hooks/useFlashcardGeneration";
import { MAX_INPUT_LENGTH, MIN_INPUT_LENGTH } from "@/lib/flashcard-limits";
import { cn } from "@/lib/utils";

const formatCount = (n: number) => n.toLocaleString("pl-PL");

const primaryButton =
  "rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500";
const secondaryButton =
  "rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white transition-colors hover:bg-white/20";

function cardsLabel(n: number) {
  if (n === 1) return "fiszkę";
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14))
    return "fiszki";
  return "fiszek";
}

export default function FlashcardGenerator() {
  const gen = useFlashcardGeneration();
  const length = gen.text.trim().length;
  const lengthValid = length >= MIN_INPUT_LENGTH && length <= MAX_INPUT_LENGTH;

  if (gen.step === "saved") {
    return (
      <div className="space-y-6 text-center">
        <p className="text-xl font-semibold text-white">
          Zapisano {gen.savedCount} {cardsLabel(gen.savedCount)}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href="/dashboard" className={secondaryButton}>
            Przejdź do panelu
          </a>
          <Button className={primaryButton} onClick={gen.reset}>
            <Sparkles /> Generuj kolejne
          </Button>
        </div>
      </div>
    );
  }

  if (gen.step === "reviewing" || gen.step === "saving") {
    const saving = gen.step === "saving";
    const pendingCount = gen.cards.filter((c) => c.status === "pending").length;
    const rejectedCount = gen.cards.filter(
      (c) => c.status === "rejected",
    ).length;
    const editingAny = gen.editingIds.size > 0;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-blue-100/80">
          <span>Propozycje: {gen.cards.length}</span>
          <span className="text-emerald-200">
            Zaakceptowane: {gen.acceptedCount}
          </span>
          <span>Odrzucone: {rejectedCount}</span>
          <span>Do decyzji: {pendingCount}</span>
        </div>

        <ul className="space-y-3">
          {gen.cards.map((card, index) => (
            <ProposalCard
              key={card.id}
              card={card}
              index={index}
              disabled={saving}
              editing={gen.editingIds.has(card.id)}
              onEditStart={() => {
                gen.startEditing(card.id);
              }}
              onEditCancel={() => {
                gen.cancelEditing(card.id);
              }}
              onAccept={() => {
                gen.accept(card.id);
              }}
              onReject={() => {
                gen.reject(card.id);
              }}
              onUndo={() => {
                gen.undo(card.id);
              }}
              onUpdate={(front, back) => {
                gen.updateCard(card.id, front, back);
              }}
            />
          ))}
        </ul>

        <ServerError message={gen.error} />

        {editingAny && (
          <p className="text-right text-sm text-blue-100/70">
            Zakończ edycję fiszki, aby zapisać.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3">
          <Button
            className={secondaryButton}
            disabled={saving || editingAny || pendingCount === 0}
            onClick={gen.acceptRemaining}
          >
            <CheckCheck /> Akceptuj pozostałe
          </Button>
          <Button
            className={primaryButton}
            disabled={saving || editingAny}
            onClick={() => void gen.save()}
          >
            {saving ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Zapisywanie…
              </>
            ) : (
              <>
                <Save />
                {gen.acceptedCount > 0
                  ? `Zapisz (${String(gen.acceptedCount)})`
                  : "Zakończ bez zapisu"}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  const generating = gen.step === "generating";

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (lengthValid && !generating) void gen.generate();
      }}
    >
      <label className="block space-y-2">
        <span className="text-sm text-blue-100/80">
          Wklej tekst, z którego chcesz utworzyć fiszki
        </span>
        <textarea
          className="min-h-64 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-blue-100/40 focus:border-purple-400 focus:outline-none disabled:opacity-60"
          value={gen.text}
          disabled={generating}
          placeholder="Np. fragment notatek, artykułu lub podręcznika…"
          onChange={(e) => {
            gen.setText(e.target.value);
          }}
        />
      </label>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-blue-100/50">
          Minimum {formatCount(MIN_INPUT_LENGTH)} znaków
        </span>
        <span
          className={cn(
            "tabular-nums",
            lengthValid
              ? "text-emerald-200"
              : length > MAX_INPUT_LENGTH
                ? "text-red-300"
                : "text-blue-100/60",
          )}
        >
          {formatCount(length)} / {formatCount(MAX_INPUT_LENGTH)}
        </span>
      </div>

      <ServerError message={gen.error} />

      {generating ? (
        <GenerationProgress />
      ) : (
        <Button
          type="submit"
          className={cn(primaryButton, "w-full")}
          disabled={!lengthValid}
        >
          <Sparkles /> Generuj
        </Button>
      )}
    </form>
  );
}

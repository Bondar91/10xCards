import { useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { DeckCard, type DeckCardMode } from "@/components/deck/DeckCard";
import { NewFlashcardForm } from "@/components/deck/NewFlashcardForm";
import { useFlashcardDeck } from "@/components/hooks/useFlashcardDeck";
import type { UpdateFlashcardRequest } from "@/types";

interface ActiveCard {
  id: string;
  mode: Exclude<DeckCardMode, "view">;
}

const navButton = "text-blue-100 hover:bg-white/10 hover:text-white";

export function FlashcardDeck() {
  const deck = useFlashcardDeck();
  // Only one card may be in edit or confirm-delete mode at a time.
  const [active, setActive] = useState<ActiveCard | null>(null);

  const loading = deck.status === "loading";
  // A pending edit/delete/create reloads a page when done; paging meanwhile would be undone.
  const navLocked = loading || deck.busyId !== null || deck.creating;
  const empty = deck.status === "ready" && deck.cards.length === 0;

  function modeFor(id: string): DeckCardMode {
    return active?.id === id ? active.mode : "view";
  }

  async function save(id: string, content: UpdateFlashcardRequest) {
    if (await deck.updateCard(id, content)) setActive(null);
  }

  async function remove(id: string) {
    if (await deck.deleteCard(id)) setActive(null);
  }

  function goToPage(target: number) {
    setActive(null);
    deck.goToPage(target);
  }

  // The form stays mounted across error / spinner / empty / list so a create from an
  // empty deck keeps its open state and focus through the page-1 reload, even if that
  // reload fails after the card was saved.
  return (
    <div className="space-y-4">
      <ServerError message={deck.error} />

      <NewFlashcardForm
        forceOpen={empty}
        disabled={loading || deck.busyId !== null}
        creating={deck.creating}
        onOpen={() => {
          setActive(null);
        }}
        onCreate={deck.createCard}
      />

      {deck.status === "error" && deck.cards.length === 0 ? (
        <Button
          className="bg-purple-600 text-white hover:bg-purple-500"
          onClick={deck.reload}
        >
          Spróbuj ponownie
        </Button>
      ) : loading && deck.cards.length === 0 ? (
        <div className="flex justify-center py-12">
          <span className="size-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      ) : empty ? (
        <div className="space-y-4 py-6 text-center">
          <p className="text-xl font-semibold text-white">
            Nie masz jeszcze fiszek.
          </p>
          <p className="text-blue-100/80">
            Dodaj pierwszą ręcznie albo wygeneruj je z tekstu.
          </p>
          <a
            href="/generate"
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 py-2.5 font-medium text-white transition-colors hover:bg-white/20"
          >
            <Sparkles className="size-4" /> Generuj fiszki
          </a>
        </div>
      ) : (
        <>
          <p className="text-sm text-blue-100/60">
            Fiszek w talii: {deck.total}
          </p>

          <ul className="space-y-3">
            {deck.cards.map((card) => (
              <DeckCard
                key={card.id}
                card={card}
                mode={modeFor(card.id)}
                busy={deck.busyId === card.id}
                disabled={navLocked}
                onEditStart={() => {
                  setActive({ id: card.id, mode: "edit" });
                }}
                onDeleteStart={() => {
                  setActive({ id: card.id, mode: "confirm-delete" });
                }}
                onCancel={() => {
                  setActive(null);
                }}
                onSave={(content) => {
                  void save(card.id, content);
                }}
                onDeleteConfirm={() => {
                  void remove(card.id);
                }}
              />
            ))}
          </ul>

          {deck.totalPages > 1 && (
            <nav className="flex items-center justify-between gap-2 pt-2">
              <Button
                size="sm"
                variant="ghost"
                className={navButton}
                disabled={navLocked || deck.page <= 1}
                onClick={() => {
                  goToPage(deck.page - 1);
                }}
              >
                <ChevronLeft /> Poprzednia
              </Button>
              <span className="text-sm text-blue-100/80">
                Strona {deck.page} z {deck.totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className={navButton}
                disabled={navLocked || deck.page >= deck.totalPages}
                onClick={() => {
                  goToPage(deck.page + 1);
                }}
              >
                Następna <ChevronRight />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

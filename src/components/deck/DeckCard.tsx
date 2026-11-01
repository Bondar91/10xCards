import { useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlashcardFields } from "@/components/deck/FlashcardFields";
import { flashcardDraftState } from "@/lib/flashcard-limits";
import { cn } from "@/lib/utils";
import type {
  FlashcardDto,
  FlashcardSource,
  UpdateFlashcardRequest,
} from "@/types";

export type DeckCardMode = "view" | "edit" | "confirm-delete";

interface DeckCardProps {
  card: FlashcardDto;
  mode: DeckCardMode;
  busy: boolean;
  disabled: boolean;
  onEditStart: () => void;
  onDeleteStart: () => void;
  onCancel: () => void;
  onSave: (content: UpdateFlashcardRequest) => void;
  onDeleteConfirm: () => void;
}

const SOURCE_LABEL: Record<FlashcardSource, string> = {
  ai: "AI",
  "ai-edited": "AI · edytowana",
  manual: "Ręczna",
};

const ghostButton = "text-blue-100 hover:bg-white/10 hover:text-white";

export function DeckCard({
  card,
  mode,
  busy,
  disabled,
  onEditStart,
  onDeleteStart,
  onCancel,
  onSave,
  onDeleteConfirm,
}: DeckCardProps) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);

  const draftValid = flashcardDraftState(front, back).valid;

  function startEditing() {
    setFront(card.front);
    setBack(card.back);
    onEditStart();
  }

  function save() {
    if (!draftValid || busy) return;
    onSave({ front, back });
  }

  return (
    <li
      className={cn(
        "rounded-xl border bg-white/5 p-4 transition-colors",
        mode === "confirm-delete"
          ? "border-red-400/40 bg-red-900/10"
          : "border-white/10",
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-blue-100/60">
        <span
          className={cn(
            "rounded-full px-2 py-0.5",
            card.source === "ai" && "bg-blue-500/20 text-blue-200",
            card.source === "ai-edited" && "bg-purple-500/20 text-purple-200",
            card.source === "manual" && "bg-emerald-500/20 text-emerald-200",
          )}
        >
          {SOURCE_LABEL[card.source]}
        </span>
      </div>

      {mode === "edit" ? (
        <div className="space-y-3">
          <FlashcardFields
            front={front}
            back={back}
            onFrontChange={setFront}
            onBackChange={setBack}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-purple-600 text-white hover:bg-purple-500"
              disabled={busy || !draftValid}
              onClick={save}
            >
              <Check /> Zapisz
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={ghostButton}
              disabled={busy}
              onClick={onCancel}
            >
              Anuluj
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="font-medium whitespace-pre-line text-white">
            {card.front}
          </p>
          <p className="mt-1 text-sm whitespace-pre-line text-blue-100/80">
            {card.back}
          </p>
          {mode === "confirm-delete" ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-red-200">
                Na pewno usunąć tę fiszkę? Historia powtórek też zostanie
                usunięta.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-red-600 text-white hover:bg-red-500"
                  disabled={busy}
                  onClick={onDeleteConfirm}
                >
                  <Trash2 /> Usuń
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={ghostButton}
                  disabled={busy}
                  onClick={onCancel}
                >
                  Anuluj
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                className={ghostButton}
                disabled={disabled}
                onClick={startEditing}
              >
                <Pencil /> Edytuj
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-200 hover:bg-red-900/30 hover:text-red-100"
                disabled={disabled}
                onClick={onDeleteStart}
              >
                <Trash2 /> Usuń
              </Button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

import { useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BACK_MAX_LENGTH, FRONT_MAX_LENGTH } from "@/lib/flashcard-limits";
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

const fieldClass =
  "w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-blue-100/40 focus:border-purple-400 focus:outline-none";

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

  const frontLength = front.trim().length;
  const backLength = back.trim().length;
  const draftValid =
    frontLength >= 1 &&
    frontLength <= FRONT_MAX_LENGTH &&
    backLength >= 1 &&
    backLength <= BACK_MAX_LENGTH;

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
          <label className="block space-y-1 text-sm">
            <span className="text-blue-100/80">Przód</span>
            <textarea
              className={fieldClass}
              rows={2}
              disabled={busy}
              value={front}
              onChange={(e) => {
                setFront(e.target.value);
              }}
            />
            <span
              className={cn(
                "block text-xs",
                frontLength > FRONT_MAX_LENGTH
                  ? "text-red-300"
                  : "text-blue-100/50",
              )}
            >
              {frontLength} / {FRONT_MAX_LENGTH}
            </span>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-blue-100/80">Tył</span>
            <textarea
              className={fieldClass}
              rows={3}
              disabled={busy}
              value={back}
              onChange={(e) => {
                setBack(e.target.value);
              }}
            />
            <span
              className={cn(
                "block text-xs",
                backLength > BACK_MAX_LENGTH
                  ? "text-red-300"
                  : "text-blue-100/50",
              )}
            >
              {backLength} / {BACK_MAX_LENGTH}
            </span>
          </label>
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

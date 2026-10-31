import { useState } from "react";
import { Check, Pencil, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isEdited,
  type ReviewCard,
} from "@/components/hooks/useFlashcardGeneration";
import { BACK_MAX_LENGTH, FRONT_MAX_LENGTH } from "@/lib/flashcard-limits";
import { cn } from "@/lib/utils";

interface ProposalCardProps {
  card: ReviewCard;
  index: number;
  disabled: boolean;
  editing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
  onUpdate: (front: string, back: string) => void;
}

const STATUS_LABEL = {
  pending: null,
  accepted: "Zaakceptowana",
  rejected: "Odrzucona",
} as const;

const fieldClass =
  "w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-blue-100/40 focus:border-purple-400 focus:outline-none";

export function ProposalCard({
  card,
  index,
  disabled,
  editing,
  onEditStart,
  onEditCancel,
  onAccept,
  onReject,
  onUndo,
  onUpdate,
}: ProposalCardProps) {
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

  function commitEdit() {
    if (!draftValid) return;
    onUpdate(front, back);
  }

  const statusLabel = STATUS_LABEL[card.status];

  return (
    <li
      className={cn(
        "rounded-xl border bg-white/5 p-4 transition-colors",
        card.status === "accepted" && "border-emerald-400/40 bg-emerald-900/20",
        card.status === "rejected" && "border-white/5 opacity-50",
        card.status === "pending" && "border-white/10",
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-blue-100/60">
        <span>Fiszka {index + 1}</span>
        {statusLabel && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5",
              card.status === "accepted"
                ? "bg-emerald-500/20 text-emerald-200"
                : "bg-white/10",
            )}
          >
            {statusLabel}
          </span>
        )}
        {isEdited(card) && (
          <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-purple-200">
            Edytowana
          </span>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-blue-100/80">Przód</span>
            <textarea
              className={fieldClass}
              rows={2}
              disabled={disabled}
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
              disabled={disabled}
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
              disabled={disabled || !draftValid}
              onClick={commitEdit}
            >
              <Check /> Zapisz zmiany
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-blue-100 hover:bg-white/10 hover:text-white"
              disabled={disabled}
              onClick={onEditCancel}
            >
              Anuluj
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="font-medium text-white">{card.front}</p>
          <p className="mt-1 text-sm whitespace-pre-line text-blue-100/80">
            {card.back}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {card.status === "pending" ? (
              <>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                  disabled={disabled}
                  onClick={onAccept}
                >
                  <Check /> Akceptuj
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-blue-100 hover:bg-white/10 hover:text-white"
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
                  onClick={onReject}
                >
                  <X /> Odrzuć
                </Button>
              </>
            ) : (
              <>
                {card.status === "accepted" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-blue-100 hover:bg-white/10 hover:text-white"
                    disabled={disabled}
                    onClick={startEditing}
                  >
                    <Pencil /> Edytuj
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-blue-100 hover:bg-white/10 hover:text-white"
                  disabled={disabled}
                  onClick={onUndo}
                >
                  <Undo2 /> Cofnij decyzję
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </li>
  );
}

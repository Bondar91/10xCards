import type { KeyboardEvent, Ref } from "react";
import {
  BACK_MAX_LENGTH,
  FRONT_MAX_LENGTH,
  flashcardDraftState,
} from "@/lib/flashcard-limits";
import { cn } from "@/lib/utils";

interface FlashcardFieldsProps {
  front: string;
  back: string;
  onFrontChange: (value: string) => void;
  onBackChange: (value: string) => void;
  disabled: boolean;
  frontRef?: Ref<HTMLTextAreaElement>;
  /** Called on Ctrl/Cmd+Enter in either field. */
  onSubmitShortcut?: () => void;
}

const fieldClass =
  "w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-blue-100/40 focus:border-purple-400 focus:outline-none";

function Counter({ length, max }: { length: number; max: number }) {
  return (
    <span
      className={cn(
        "block text-xs",
        length > max ? "text-red-300" : "text-blue-100/50",
      )}
    >
      {length} / {max}
    </span>
  );
}

/** Front/back textareas with trimmed-length counters, shared by deck edit and manual create. */
export function FlashcardFields({
  front,
  back,
  onFrontChange,
  onBackChange,
  disabled,
  frontRef,
  onSubmitShortcut,
}: FlashcardFieldsProps) {
  const { frontLength, backLength } = flashcardDraftState(front, back);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (onSubmitShortcut && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmitShortcut();
    }
  }

  return (
    <>
      <label className="block space-y-1 text-sm">
        <span className="text-blue-100/80">Przód</span>
        <textarea
          ref={frontRef}
          className={fieldClass}
          rows={2}
          disabled={disabled}
          value={front}
          onChange={(e) => {
            onFrontChange(e.target.value);
          }}
          onKeyDown={handleKeyDown}
        />
        <Counter length={frontLength} max={FRONT_MAX_LENGTH} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-blue-100/80">Tył</span>
        <textarea
          className={fieldClass}
          rows={3}
          disabled={disabled}
          value={back}
          onChange={(e) => {
            onBackChange(e.target.value);
          }}
          onKeyDown={handleKeyDown}
        />
        <Counter length={backLength} max={BACK_MAX_LENGTH} />
      </label>
    </>
  );
}

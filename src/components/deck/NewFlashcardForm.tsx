import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlashcardFields } from "@/components/deck/FlashcardFields";
import { flashcardDraftState } from "@/lib/flashcard-limits";
import type { CreateFlashcardRequest } from "@/types";

interface NewFlashcardFormProps {
  /** Keep the form expanded (empty deck: manual create is the AI-outage fallback). */
  forceOpen: boolean;
  /** Another deck action is in flight. */
  disabled: boolean;
  creating: boolean;
  onOpen: () => void;
  onCreate: (content: CreateFlashcardRequest) => Promise<boolean>;
}

export function NewFlashcardForm({
  forceOpen,
  disabled,
  creating,
  onOpen,
  onCreate,
}: NewFlashcardFormProps) {
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const frontRef = useRef<HTMLTextAreaElement>(null);
  // Synchronous guard: one click / Ctrl+Enter = one request, even before `creating` re-renders.
  const inFlight = useRef(false);

  // Once forced open (empty deck), stay open after the first card lands — the reload
  // passes through a loading state where forceOpen briefly drops.
  if (forceOpen && !open) setOpen(true);

  const { valid } = flashcardDraftState(front, back);
  const canSubmit = valid && !creating && !disabled;

  async function submit() {
    if (!canSubmit || inFlight.current) return;
    inFlight.current = true;
    const created = await onCreate({ front, back });
    inFlight.current = false;
    if (created) {
      setFront("");
      setBack("");
      // Stay open for the next card even after the deck stops being empty.
      setOpen(true);
      // Fields are re-enabled after this render; focus once they are.
      requestAnimationFrame(() => frontRef.current?.focus());
    }
  }

  function cancel() {
    setFront("");
    setBack("");
    setOpen(false);
  }

  if (!open && !forceOpen) {
    return (
      <Button
        className="bg-purple-600 text-white hover:bg-purple-500"
        disabled={disabled || creating}
        onClick={() => {
          onOpen();
          setOpen(true);
        }}
      >
        <Plus /> Dodaj fiszkę
      </Button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-purple-400/30 bg-white/5 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-sm font-semibold text-white">Nowa fiszka</p>
      <FlashcardFields
        front={front}
        back={back}
        onFrontChange={setFront}
        onBackChange={setBack}
        disabled={creating}
        frontRef={frontRef}
        onSubmitShortcut={() => {
          void submit();
        }}
      />
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          className="bg-purple-600 text-white hover:bg-purple-500"
          disabled={!canSubmit}
        >
          {creating ? (
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <Plus />
          )}
          Dodaj
        </Button>
        {!forceOpen && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-blue-100 hover:bg-white/10 hover:text-white"
            disabled={creating}
            onClick={cancel}
          >
            Anuluj
          </Button>
        )}
      </div>
    </form>
  );
}

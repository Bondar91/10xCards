import { useEffect, useRef, useState } from "react";
import {
  requestJson,
  type RequestResult,
  type StatusMessages,
} from "@/lib/request-json";
import type {
  FlashcardDto,
  FlashcardListResponse,
  UpdateFlashcardRequest,
  UpdateFlashcardResponse,
} from "@/types";

export type DeckStatus = "loading" | "ready" | "error";

const STATUS_MESSAGES: StatusMessages = {
  400: "Nieprawidłowa treść fiszki.",
  401: "Sesja wygasła. Zaloguj się ponownie.",
  503: "Baza danych jest chwilowo niedostępna. Spróbuj za chwilę.",
};

const GONE_MESSAGE = "Ta fiszka już nie istnieje.";

interface LoadedPage {
  page: number;
  result: RequestResult<FlashcardListResponse>;
}

/**
 * Fetch a page; if it is empty (deletes here or in another tab), jump to the last
 * page per the returned total. Loops only if the deck keeps shrinking meanwhile.
 */
async function fetchPage(target: number): Promise<LoadedPage> {
  let page = target;
  for (;;) {
    const result = await requestJson<FlashcardListResponse>(
      `/api/flashcards?page=${String(page)}`,
      STATUS_MESSAGES,
    );
    if (!result.ok || result.data.cards.length > 0 || page <= 1) {
      return { page, result };
    }
    const { total, pageSize } = result.data;
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(page - 1, lastPage);
  }
}

export function useFlashcardDeck() {
  const [cards, setCards] = useState<FlashcardDto[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [status, setStatus] = useState<DeckStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  // Id of the card whose edit/delete request is in flight.
  const [busyId, setBusyId] = useState<string | null>(null);
  // Only the latest list request may update state (fast paging, refetch after delete).
  const requestSeq = useRef(0);

  function applyPage(loaded: LoadedPage) {
    if (!loaded.result.ok) {
      setError(loaded.result.message);
      setStatus("error");
      return;
    }
    setCards(loaded.result.data.cards);
    setTotal(loaded.result.data.total);
    setPageSize(loaded.result.data.pageSize);
    setPage(loaded.page);
    setStatus("ready");
  }

  useEffect(() => {
    let cancelled = false;
    const seq = ++requestSeq.current;
    void fetchPage(1).then((loaded) => {
      if (!cancelled && seq === requestSeq.current) applyPage(loaded);
    });
    // Drop the in-flight load on unmount (and on the StrictMode re-run).
    return () => {
      cancelled = true;
    };
  }, []);

  async function reloadAt(target: number) {
    const seq = ++requestSeq.current;
    setStatus("loading");
    const loaded = await fetchPage(target);
    if (seq === requestSeq.current) applyPage(loaded);
  }

  function goToPage(target: number) {
    setError(null);
    void reloadAt(target);
  }

  async function updateCard(
    id: string,
    content: UpdateFlashcardRequest,
  ): Promise<boolean> {
    setBusyId(id);
    setError(null);
    const result = await requestJson<UpdateFlashcardResponse>(
      `/api/flashcards/${id}`,
      STATUS_MESSAGES,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      },
    );
    setBusyId(null);

    if (result.ok) {
      const updated = result.data.card;
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      return true;
    }

    if (result.status === 404) {
      setError(GONE_MESSAGE);
      void reloadAt(page);
      return true;
    }

    setError(result.message);
    return false;
  }

  async function deleteCard(id: string): Promise<boolean> {
    setBusyId(id);
    setError(null);
    const result = await requestJson<{ deleted: true }>(
      `/api/flashcards/${id}`,
      STATUS_MESSAGES,
      { method: "DELETE" },
    );
    setBusyId(null);

    if (!result.ok && result.status !== 404) {
      setError(result.message);
      return false;
    }

    if (!result.ok) setError(GONE_MESSAGE);
    // Drop it locally so it doesn't linger if the reload below fails.
    setCards((prev) => prev.filter((c) => c.id !== id));
    await reloadAt(page);
    return true;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    cards,
    page,
    total,
    totalPages,
    status,
    error,
    busyId,
    goToPage,
    reload: () => {
      goToPage(page);
    },
    updateCard,
    deleteCard,
  };
}

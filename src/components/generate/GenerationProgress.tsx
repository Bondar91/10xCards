import { useEffect, useState } from "react";

const STATUS_LINES = [
  "Analizuję tekst…",
  "Wyszukuję najważniejsze fakty…",
  "Tworzę pytania…",
  "Dopracowuję odpowiedzi…",
  "Jeszcze chwila…",
];

const LINE_INTERVAL_S = 4;

export function GenerationProgress() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  const line =
    STATUS_LINES[
      Math.min(Math.floor(elapsed / LINE_INTERVAL_S), STATUS_LINES.length - 1)
    ];

  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-blue-100">
        <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        <span>{line}</span>
        <span className="ml-auto text-sm text-blue-100/60 tabular-nums">
          {elapsed} s
        </span>
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse space-y-2 rounded-xl border border-white/10 bg-white/5 p-4"
        >
          <div className="h-4 w-3/4 rounded bg-white/15" />
          <div className="h-3 w-full rounded bg-white/10" />
          <div className="h-3 w-5/6 rounded bg-white/10" />
        </div>
      ))}
    </div>
  );
}

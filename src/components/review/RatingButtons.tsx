import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReviewIntervals, ReviewRating } from "@/types";

const RATINGS: { rating: ReviewRating; label: string; className: string }[] = [
  {
    rating: 1,
    label: "Nie pamiętam",
    className: "border-red-400/40 bg-red-900/30 hover:bg-red-900/50",
  },
  {
    rating: 2,
    label: "Trudne",
    className: "border-amber-400/40 bg-amber-900/30 hover:bg-amber-900/50",
  },
  {
    rating: 3,
    label: "Dobrze",
    className:
      "border-emerald-400/40 bg-emerald-900/30 hover:bg-emerald-900/50",
  },
  {
    rating: 4,
    label: "Łatwe",
    className: "border-sky-400/40 bg-sky-900/30 hover:bg-sky-900/50",
  },
];

const ratingButton =
  "h-auto flex-col gap-0.5 rounded-lg border px-3 py-2 text-white transition-colors";

interface RatingButtonsProps {
  intervals: ReviewIntervals;
  disabled: boolean;
  pendingRating: ReviewRating | null;
  onRate: (rating: ReviewRating) => void;
}

export function RatingButtons({
  intervals,
  disabled,
  pendingRating,
  onRate,
}: RatingButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {RATINGS.map(({ rating, label, className }) => (
        <Button
          key={rating}
          className={cn(
            ratingButton,
            className,
            pendingRating === rating && "ring-2 ring-white/60",
          )}
          disabled={disabled}
          aria-keyshortcuts={String(rating)}
          onClick={() => {
            onRate(rating);
          }}
        >
          <span className="flex items-center gap-2 font-medium">
            {pendingRating === rating && (
              <span className="size-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            {label}
          </span>
          <span className="text-xs text-blue-100/70 tabular-nums">
            {intervals[rating]} · {rating}
          </span>
        </Button>
      ))}
    </div>
  );
}

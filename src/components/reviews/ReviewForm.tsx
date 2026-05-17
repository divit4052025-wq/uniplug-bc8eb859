// Review submission form — modal Dialog.
//
// Students rate a mentor 1–5 stars and write up to 500 characters of free-
// form text. The mutation uses the shared useOptimisticMutation hook so a
// failure surfaces as a sonner toast and the cache invalidates on success.
// RLS gate from migration 20260514100001 rejects an insert unless a
// completed booking exists between the pair, so callers must only render
// this form when their CTA condition is met.
//
// Star rating input is keyboard-navigable via an ARIA radiogroup:
//   Tab               focus the rating
//   ArrowLeft/Right   move between stars (1–5)
//   1, 2, 3, 4, 5     jump straight to that rating
//   Space / Enter     confirm focused rating
//
// The form mounts inside a Dialog and is unmounted when closed, so each open
// gets a fresh rating + draft.

import * as React from "react";
import { Star } from "lucide-react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useOptimisticMutation } from "@/lib/hooks/useOptimisticMutation";

export const REVIEW_MAX_LENGTH = 500;

interface ReviewFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  mentorId: string;
  mentorName: string;
  /**
   * Query keys whose caches should be invalidated when the review lands.
   * Callers pass the mentor profile / past-sessions / has-reviewed keys so
   * the CTA flips and the new review appears wherever it's rendered.
   */
  invalidateOnSuccess?: QueryKey[];
}

interface ReviewVariables {
  rating: number;
  review: string;
}

export function ReviewForm({
  open,
  onOpenChange,
  studentId,
  mentorId,
  mentorName,
  invalidateOnSuccess = [],
}: ReviewFormProps) {
  const qc = useQueryClient();
  const [rating, setRating] = React.useState<number>(0);
  const [draft, setDraft] = React.useState<string>("");

  // Reset state every time the modal opens.
  React.useEffect(() => {
    if (open) {
      setRating(0);
      setDraft("");
    }
  }, [open]);

  const submitMutation = useOptimisticMutation<unknown, ReviewVariables, void>({
    mutationFn: async ({ rating, review }) => {
      const { error } = await supabase.from("reviews").insert({
        student_id: studentId,
        mentor_id: mentorId,
        rating,
        review,
      });
      if (error) throw error;
    },
    // No optimistic patch on a specific cache shape — the success path
    // invalidates downstream queries. We still hand the hook the query keys
    // so cancel / invalidate go through the standard lifecycle.
    queryKeys: invalidateOnSuccess,
    optimisticUpdate: (oldData) => oldData,
    successMessage: "Review submitted. Thank you!",
    errorMessage:
      "Could not submit your review. Make sure your session has completed and try again.",
    mutationOptions: {
      onSuccess: () => {
        for (const key of invalidateOnSuccess) {
          void qc.invalidateQueries({ queryKey: key });
        }
        onOpenChange(false);
      },
    },
  });

  const remaining = REVIEW_MAX_LENGTH - draft.length;
  const canSubmit = rating >= 1 && rating <= 5 && !submitMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    submitMutation.mutate({ rating, review: draft.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Review {mentorName}</DialogTitle>
          <DialogDescription>
            Share your honest take so future students know what to expect.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <p
              id="review-rating-label"
              className="text-[12px] font-medium uppercase tracking-wide text-[#1A1A1A]/60"
            >
              Rating
            </p>
            <StarRating value={rating} onChange={setRating} labelId="review-rating-label" />
          </div>

          <div>
            <label
              htmlFor="review-text"
              className="text-[12px] font-medium uppercase tracking-wide text-[#1A1A1A]/60"
            >
              Your review (optional)
            </label>
            <Textarea
              id="review-text"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, REVIEW_MAX_LENGTH))}
              maxLength={REVIEW_MAX_LENGTH}
              placeholder={`What was helpful about your session with ${mentorName}?`}
              className="mt-2 min-h-[120px]"
            />
            <p
              className={`mt-1 text-right text-[11px] ${
                remaining <= 20 ? "text-[#C4907F]" : "text-[#1A1A1A]/50"
              }`}
              aria-live="polite"
            >
              {remaining} / {REVIEW_MAX_LENGTH}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-10 items-center justify-center rounded-full border border-[#EDE0DB] bg-[#FFFCFB] px-5 text-[13px] font-medium text-[#1A1A1A] hover:border-[#C4907F]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex h-10 items-center justify-center rounded-full bg-[#C4907F] px-6 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {submitMutation.isPending ? "Submitting…" : "Submit review"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── StarRating ───────────────────────────────────────────────────────────────
// 5-star input with keyboard navigation matching ARIA radiogroup semantics.

interface StarRatingProps {
  value: number;
  onChange: (next: number) => void;
  labelId: string;
}

export const StarRating = React.forwardRef<HTMLDivElement, StarRatingProps>(
  function StarRating({ value, onChange, labelId }, ref) {
    const [focusedIdx, setFocusedIdx] = React.useState<number>(0);

    const setRating = (next: number) => {
      const clamped = Math.max(1, Math.min(5, next));
      onChange(clamped);
      setFocusedIdx(clamped - 1);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      const current = value > 0 ? value : focusedIdx + 1;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        setRating(current >= 5 ? 1 : current + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        setRating(current <= 1 ? 5 : current - 1);
      } else if (e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        setRating(Number.parseInt(e.key, 10));
      } else if (e.key === "Home") {
        e.preventDefault();
        setRating(1);
      } else if (e.key === "End") {
        e.preventDefault();
        setRating(5);
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setRating(focusedIdx + 1);
      }
    };

    return (
      <div
        ref={ref}
        role="radiogroup"
        aria-labelledby={labelId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="mt-2 inline-flex items-center gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#C4907F] focus-visible:ring-offset-2"
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
              onClick={() => setRating(n)}
              onFocus={() => setFocusedIdx(n - 1)}
              className="grid h-9 w-9 place-content-center rounded-full hover:bg-[#EDE0DB]/50"
            >
              <Star
                className={`h-6 w-6 ${
                  active ? "fill-[#C4907F] text-[#C4907F]" : "text-[#1A1A1A]/25"
                }`}
              />
            </button>
          );
        })}
      </div>
    );
  },
);

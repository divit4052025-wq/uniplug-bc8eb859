import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Phase E2 (2026-05-23): the three state primitives that every list /
 * query-driven section in the app should render in order to feel
 * intentional. Pair with ErrorBanner (already in this dir) so any
 * useQuery surface has all four branches covered:
 *
 *   - isLoading             → <LoadingSkeleton rows={3} />
 *   - isError               → <ErrorBanner onRetry={refetch} />
 *   - data.length === 0     → <EmptyState ... />
 *   - data.length > 0       → the actual list
 *
 * Brand tokens come from src/styles.css @theme block:
 *   bg-brand-dark | bg-brand-cream | bg-brand-brown | bg-brand-pink |
 *   bg-brand-blush. Avoid hex literals in new components.
 */

export function LoadingSkeleton({
  rows = 3,
  className,
  ariaLabel = "Loading",
}: {
  rows?: number;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-label={ariaLabel}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-14 w-full animate-pulse rounded-xl bg-brand-blush"
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">{ariaLabel}…</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  cta,
  icon,
  className,
}: {
  title: string;
  description?: string;
  cta?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-brand-pink bg-brand-cream px-6 py-10 text-center",
        className,
      )}
    >
      {icon && <div className="text-brand-brown" aria-hidden="true">{icon}</div>}
      <p className="font-display text-[16px] font-semibold text-brand-dark">{title}</p>
      {description && (
        <p className="max-w-md text-[13px] font-light text-brand-dark/70">{description}</p>
      )}
      {cta && <div className="mt-1">{cta}</div>}
    </div>
  );
}

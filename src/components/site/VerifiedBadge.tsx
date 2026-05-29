import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Phase F2: the honest "Verified" badge. Render ONLY when a mentor has a
 * real verification signal (mentors.verified_at IS NOT NULL, surfaced by the
 * display RPCs) — never for pending/rejected mentors. Brand tokens only.
 */
export function VerifiedBadge({
  className,
  label = "Verified",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary",
        className,
      )}
    >
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

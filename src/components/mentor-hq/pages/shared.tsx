// Shared LIGHT primitives for the seven Headquarters landmark interiors, matching
// the shipped design language: paper #FFFCFB, true ink #1A1A1A, brown #C4907F as
// the light accent (rose is a dark-surface accent), hairline #EDE0DB borders,
// small consistent radii. Gabarito/Quicksand inherited from the .hq-shell scope.
import type { ReactNode } from "react";
import { Lock } from "lucide-react";

import { HqCard } from "@/components/mentor-hq/HqPageShell";

/** ₹ INR formatter (en-IN grouping). Honest: 0 → "₹0". */
export function inr(n: number | null | undefined): string {
  return `₹${(n ?? 0).toLocaleString("en-IN")}`;
}

/**
 * Approval gate for the five approval-only landmarks. When the mentor is not yet
 * approved, the page renders this single honest card in place of its content.
 */
export function ApprovalLockedCard({ landmark }: { landmark: string }) {
  return (
    <HqCard>
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#EDE0DB] text-[#C4907F]">
          <Lock className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="font-display text-lg font-semibold text-[#1A1A1A]">
          {landmark} opens once you're approved
        </p>
        <p className="max-w-sm text-sm font-light text-[#1A1A1A]/60">
          We're still reviewing your application. Head to The Forge to track your verification —
          this landmark unlocks the moment you're approved.
        </p>
      </div>
    </HqCard>
  );
}

const CHIP_TONE: Record<string, { bg: string; fg: string }> = {
  // Light chips — warm brown tint for active/positive states, blush/ink for
  // neutral. Accessible ink/brown text on the light tints (no rose on light).
  pending: { bg: "#EDE0DB", fg: "#5a524b" },
  scheduled: { bg: "#F3E3DC", fg: "#8a5638" },
  held: { bg: "#F3E3DC", fg: "#8a5638" },
  paid: { bg: "#F3E3DC", fg: "#8a5638" },
  confirmed: { bg: "#F3E3DC", fg: "#8a5638" },
  open: { bg: "#F3E3DC", fg: "#8a5638" },
  reviewing: { bg: "#F3E3DC", fg: "#8a5638" },
  refunded: { bg: "#EDE0DB", fg: "#5a524b" },
  resolved: { bg: "#EDE0DB", fg: "#5a524b" },
  dismissed: { bg: "#EDE0DB", fg: "#5a524b" },
};

const STATE_LABEL: Record<string, string> = {
  pending: "Pending",
  scheduled: "Queued to pay",
  held: "Held",
  paid: "Paid out",
  refunded: "Refunded",
};

/** A small status chip. `label` overrides the default for `state`. */
export function StatusChip({ state, label }: { state: string; label?: string }) {
  const tone = CHIP_TONE[state] ?? { bg: "#EDE0DB", fg: "#5a524b" };
  const text = label ?? STATE_LABEL[state] ?? state;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {text}
    </span>
  );
}

/** Section heading inside a landmark interior. */
export function HqSectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-[19px] font-semibold text-[#1A1A1A]">{children}</h2>
      {sub ? <p className="mt-1 text-[13px] font-light text-[#1A1A1A]/55">{sub}</p> : null}
    </div>
  );
}

// Shared dark-themed primitives for the seven Headquarters landmark interiors.
// Brand tokens only (no dusty-rose #E8C4B8); Gabarito/Quicksand are inherited
// from the .hq-shell scope set by HqPageShell. lucide icons only.
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
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(250,245,239,0.14)]"
          style={{ color: "var(--brand-rose)" }}
        >
          <Lock className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="font-display text-lg font-semibold">{landmark} opens once you're approved</p>
        <p className="max-w-sm text-sm" style={{ color: "var(--brand-ink-faint)" }}>
          We're still reviewing your application. Head to The Forge to track your verification —
          this landmark unlocks the moment you're approved.
        </p>
      </div>
    </HqCard>
  );
}

const CHIP_TONE: Record<string, { bg: string; fg: string }> = {
  // Dark translucent chips — brand tokens / rose / neutral only (matches the
  // canonical HQ palette in MentorHqHome: rose accent + neutral, no other hues).
  pending: { bg: "rgba(250,245,239,0.10)", fg: "var(--brand-paper)" },
  scheduled: { bg: "rgba(244,181,170,0.16)", fg: "var(--brand-rose)" },
  held: { bg: "rgba(244,181,170,0.16)", fg: "var(--brand-rose)" },
  paid: { bg: "rgba(244,181,170,0.16)", fg: "var(--brand-rose)" },
  confirmed: { bg: "rgba(244,181,170,0.16)", fg: "var(--brand-rose)" },
  refunded: { bg: "rgba(250,245,239,0.08)", fg: "var(--brand-ink-faint)" },
  open: { bg: "rgba(244,181,170,0.16)", fg: "var(--brand-rose)" },
  reviewing: { bg: "rgba(244,181,170,0.16)", fg: "var(--brand-rose)" },
  resolved: { bg: "rgba(250,245,239,0.10)", fg: "var(--brand-paper)" },
  dismissed: { bg: "rgba(250,245,239,0.08)", fg: "var(--brand-ink-faint)" },
};

const STATE_LABEL: Record<string, string> = {
  pending: "Pending",
  scheduled: "Queued to pay",
  held: "Held",
  paid: "Paid out",
  refunded: "Refunded",
};

/** A small dark status chip. `label` overrides the default for `state`. */
export function StatusChip({ state, label }: { state: string; label?: string }) {
  const tone = CHIP_TONE[state] ?? { bg: "rgba(250,245,239,0.10)", fg: "var(--brand-paper)" };
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
    <div className="mb-3">
      <h2 className="font-display text-lg font-bold">{children}</h2>
      {sub ? (
        <p className="mt-0.5 text-[13px]" style={{ color: "var(--brand-ink-faint)" }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

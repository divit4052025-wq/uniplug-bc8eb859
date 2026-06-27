import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/site/Logo";
import { FounderCompanion } from "@/components/student-signup/v2/FounderCompanion";
import type { MascotExpression } from "@/components/mascots/Mascot";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";
import { Beacon } from "./beacon/Beacon";

/**
 * HqPageShell — the LIGHT chrome shared by every landmark interior, matching the
 * design language UniPlug has already shipped (the auth/login + the older mentor
 * dashboard sections): warm paper (#FFFCFB), TRUE ink (#1A1A1A), Gabarito display
 * + Quicksand body (the .hq-shell scope), hairline #EDE0DB borders, small
 * consistent radii, brown (#C4907F) as the light accent used sparingly. A
 * lightweight ghost "‹ Headquarters" return — not a competing sidebar. Locked
 * viewport (h-dvh + overflow-hidden) with an inner scroll column.
 */
export function HqPageShell({
  kind,
  title,
  intro,
  children,
  headerRight,
}: {
  kind: string;
  title: string;
  intro?: string;
  children: ReactNode;
  headerRight?: ReactNode;
}) {
  const { mentorId } = useMentorDashboard();
  return (
    <div className="hq-shell flex h-dvh flex-col overflow-hidden bg-[#FFFCFB] text-[#1A1A1A]">
      <header className="shrink-0 border-b border-[#EDE0DB] px-5 py-3.5 sm:px-8">
        <div className="mx-auto flex max-w-[1040px] items-center justify-between gap-4">
          <Link
            to="/mentor-dashboard"
            className="group inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-[#1A1A1A]/70 transition hover:text-[#C4907F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4907F]/30"
          >
            <ChevronLeft
              className="h-4 w-4 transition group-hover:-translate-x-0.5"
              aria-hidden="true"
            />
            Headquarters
          </Link>
          <div className="flex items-center gap-3">
            <Beacon userId={mentorId} tone="light" />
            <Logo variant="wordmark-offwhite" size={20} />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1040px] px-5 py-9 sm:px-8 sm:py-12">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C4907F]">
                {kind}
              </p>
              <h1 className="mt-2 font-display text-[34px] leading-[1.04] font-bold tracking-[-0.02em] text-[#1A1A1A] sm:text-[42px]">
                {title}
              </h1>
              {intro ? (
                <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed font-light text-[#1A1A1A]/60">
                  {intro}
                </p>
              ) : null}
            </div>
            {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
          </div>

          <div className="mt-9 animate-hero-rise">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** A light panel card — hairline #EDE0DB border, small radius, no shadow. */
export function HqCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-5 ${className}`}>
      {children}
    </div>
  );
}

/** A labelled stat tile. `value` is shown verbatim — pass honest values only. */
export function HqStat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-5">
      <p className="text-[11px] font-medium tracking-wide text-[#1A1A1A]/55 uppercase">{label}</p>
      <p className="mt-1.5 font-display text-[26px] font-semibold text-[#1A1A1A]">{value}</p>
      {sub ? <p className="mt-0.5 text-[12px] font-light text-[#1A1A1A]/55">{sub}</p> : null}
    </div>
  );
}

/**
 * Quiet, intentional empty state — NOT a dashed box with a centered grey icon.
 * A short friendly line in light ink, generous whitespace, optionally the
 * founder mascot. Mirrors the shipped sections' empty-state idiom.
 */
export function HqEmpty({
  children,
  mascot = false,
  expression = "thinking",
}: {
  children: ReactNode;
  mascot?: boolean;
  expression?: MascotExpression;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {mascot ? (
        <FounderCompanion
          expression={expression}
          size={84}
          color="#1A1A1A"
          className="mb-1 opacity-90"
        />
      ) : null}
      <p className="max-w-sm text-[14px] leading-relaxed font-light text-[#1A1A1A]/60">
        {children}
      </p>
    </div>
  );
}

/** Light loading skeleton rows — solid, no dashed border. */
export function HqLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-[#EDE0DB]/45" />
      ))}
    </div>
  );
}

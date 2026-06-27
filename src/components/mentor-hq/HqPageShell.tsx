import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/site/Logo";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";
import { Beacon } from "./beacon/Beacon";

/**
 * HqPageShell — the dark `--brand-night` chrome shared by every landmark interior.
 * Locked viewport (h-dvh + overflow-hidden) with an inner scroll column (the
 * AuthScreen idiom — prevents short-viewport rubber-band / white strip), a sticky
 * "‹ Headquarters" return, the eyebrow (section kind) + landmark title, and the
 * `.hq-shell` scope so everything is Gabarito/Quicksand. Brand tokens only; no
 * dusty-rose.
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
    <div
      className="hq-shell flex h-dvh flex-col overflow-hidden"
      style={{ background: "var(--brand-night)", color: "var(--brand-paper)" }}
    >
      <header className="shrink-0 border-b border-[rgba(250,245,239,0.08)] px-5 py-3.5 sm:px-8">
        <div className="mx-auto flex max-w-[1040px] items-center justify-between gap-4">
          <Link
            to="/mentor-dashboard"
            className="group inline-flex items-center gap-1.5 rounded-full border border-[rgba(250,245,239,0.14)] bg-[rgba(250,245,239,0.05)] py-1.5 pr-4 pl-2.5 text-[13px] font-semibold transition hover:border-[rgba(250,245,239,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)]"
          >
            <ChevronLeft
              className="h-4 w-4 transition group-hover:-translate-x-0.5"
              aria-hidden="true"
            />
            Headquarters
          </Link>
          <div className="flex items-center gap-2">
            <Beacon userId={mentorId} />
            <Logo variant="wordmark-dark" size={20} />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1040px] px-5 py-8 sm:px-8 sm:py-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: "var(--brand-rose)" }}
              >
                {kind}
              </p>
              <h1 className="mt-1.5 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {title}
              </h1>
              {intro ? (
                <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--brand-ink-faint)" }}>
                  {intro}
                </p>
              ) : null}
            </div>
            {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
          </div>

          <div className="mt-8 animate-hero-rise">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** A dark panel card. */
export function HqCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-[rgba(250,245,239,0.1)] bg-[rgba(250,245,239,0.04)] p-5 ${className}`}
    >
      {children}
    </div>
  );
}

/** A labelled stat tile. `value` is shown verbatim — pass honest values only. */
export function HqStat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <HqCard>
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--brand-ink-faint)" }}
      >
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl font-bold">{value}</p>
      {sub ? (
        <p className="mt-0.5 text-[12px]" style={{ color: "var(--brand-ink-faint)" }}>
          {sub}
        </p>
      ) : null}
    </HqCard>
  );
}

/** Honest empty state. */
export function HqEmpty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[rgba(250,245,239,0.14)] px-6 py-12 text-center">
      {icon ? <div style={{ color: "var(--brand-ink-faint)" }}>{icon}</div> : null}
      <p className="text-sm" style={{ color: "var(--brand-ink-faint)" }}>
        {children}
      </p>
    </div>
  );
}

/** Loading skeleton row. */
export function HqLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-2xl border border-[rgba(250,245,239,0.08)] bg-[rgba(250,245,239,0.04)]"
        />
      ))}
    </div>
  );
}

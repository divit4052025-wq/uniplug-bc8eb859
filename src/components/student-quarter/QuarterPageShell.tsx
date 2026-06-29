import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { FounderCompanion } from "@/components/student-signup/v2/FounderCompanion";
import type { MascotExpression } from "@/components/mascots/Mascot";
import "./quarter.css";

/**
 * QuarterPageShell — the LIGHT chrome shared by every Quarter landmark interior,
 * mirroring the mentor Headquarters' HqPageShell but in the locked Quarter
 * design system (Gabarito + Quicksand, paper #FFFCFB, true ink #1A1A1A, rose
 * #F4B5AA / CTA #C4907F, hairline borders). A sticky ghost "‹ The Quarter"
 * return — not a competing sidebar. Locked viewport with an inner scroll column.
 *
 * `backTo` defaults to the world (/dashboard); the Switchboard's mentor-profile
 * page passes the Switchboard so its return reads "‹ The Switchboard".
 */
export function QuarterPageShell({
  kind,
  title,
  intro,
  children,
  headerRight,
  backTo = "/dashboard",
  backLabel = "The Quarter",
}: {
  kind: string;
  title: ReactNode;
  intro?: string;
  children: ReactNode;
  headerRight?: ReactNode;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <div className="qsec">
      <div className="qsec-scroll">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- landmark routes are typed string literals resolved at the call sites */}
        <Link to={backTo as any} className="q-return">
          <span className="g">‹</span> {backLabel}
        </Link>
        <div className="q-head">
          <div className="ey">{kind}</div>
          <h1>{title}</h1>
          {intro ? <p>{intro}</p> : null}
          {headerRight ? <div style={{ marginTop: 16 }}>{headerRight}</div> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

/** A light panel card — hairline border, generous radius, no shadow. */
export function QuarterCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`qc ${className}`}>{children}</div>;
}

/**
 * Quiet, intentional empty state — the FounderCompanion mascot + a short
 * friendly line. NEVER a dashed box. Honest empties only.
 */
export function QuarterEmpty({
  title,
  children,
  expression = "thinking",
}: {
  title?: string;
  children: ReactNode;
  expression?: MascotExpression;
}) {
  return (
    <div className="q-empty">
      <FounderCompanion expression={expression} size={84} color="#1A1A1A" className="opacity-90" />
      {title ? <div className="em-t">{title}</div> : null}
      <div className="em-s">{children}</div>
    </div>
  );
}

/** Light loading skeleton rows — solid shimmer, never a dashed border. */
export function QuarterLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="q-shimmer" style={{ height: 64, borderRadius: 16 }} />
      ))}
    </div>
  );
}

/** Honest error banner — the calm "couldn't load" surface (never faked data). */
export function QuarterError({ children }: { children: ReactNode }) {
  return (
    <div className="q-error">
      <div className="et">{children}</div>
    </div>
  );
}

import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";

import { Mascot, type MascotShape, type MascotExpression } from "@/components/mascots/Mascot";
import { MASCOTS } from "@/components/mascots/mascot-data";
import { Logo } from "@/components/site/Logo";

/**
 * M — a positioned wrapper around the app's real Mascot. `color` is pulled from
 * the canonical mascot-data table so identity is always correct; `style` is
 * applied to the wrapper (matching the design's inline placement/filters).
 */
export function M({
  shape,
  expression,
  size,
  style,
  className,
}: {
  shape: MascotShape;
  expression?: MascotExpression;
  size: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span className={className} style={{ display: "inline-flex", lineHeight: 0, ...style }}>
      <Mascot
        shape={shape}
        color={MASCOTS[shape].color}
        expression={expression}
        size={size}
        decorative
      />
    </span>
  );
}

export function ArrowRight({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowLeft({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19 12H5M11 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  background: "var(--offwhite)",
  border: "1px solid var(--rule-soft)",
  boxShadow: "var(--shadow-sm)",
  borderRadius: 999,
  padding: "9px 18px 9px 15px",
  cursor: "pointer",
  textDecoration: "none",
};

/**
 * The logo pill → home. Uses the dark-ink glyph variant (umark-offwhite), which
 * is visible on the light/offwhite pill (verified against the real asset).
 */
export function LogoPill({
  size = 24,
  fontSize = 17,
  gap = 10,
}: {
  size?: number;
  fontSize?: number;
  gap?: number;
}) {
  return (
    <Link to="/" aria-label="UniPlug home" style={{ ...pillStyle, gap }}>
      <Logo variant="umark-offwhite" size={size} />
      <span
        style={{
          fontFamily: "'Gabarito', sans-serif",
          fontWeight: 800,
          fontSize,
          letterSpacing: "-.02em",
          color: "var(--ink)",
        }}
      >
        UniPlug<span style={{ color: "var(--rose-deep)" }}>.</span>
      </span>
    </Link>
  );
}

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
  background: "var(--offwhite)",
  border: "1px solid var(--rule-soft)",
  boxShadow: "var(--shadow-sm)",
  borderRadius: 999,
  padding: "10px 16px",
  cursor: "pointer",
  textDecoration: "none",
};

/**
 * The logo pill → home. Shows ONLY the "U." umark (umark-offwhite: the dark-ink
 * serif glyph on transparent), matching the landing header exactly — no typed
 * wordmark beside it.
 */
export function LogoPill({ size = 24 }: { size?: number }) {
  return (
    <Link to="/" aria-label="UniPlug home" style={pillStyle}>
      <Logo variant="umark-offwhite" size={size} />
    </Link>
  );
}

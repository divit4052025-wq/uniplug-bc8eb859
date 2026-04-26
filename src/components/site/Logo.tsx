import umarkOffwhite from "@/assets/logos/umark-offwhite.png";
import umarkDark from "@/assets/logos/umark-dark.png";
import umarkSand from "@/assets/logos/umark-sand.png";
import umarkRose from "@/assets/logos/umark-rose.png";
import umarkBlush from "@/assets/logos/umark-blush.png";
import wordmarkDark from "@/assets/logos/wordmark-dark.png";
import wordmarkOffwhite from "@/assets/logos/wordmark-offwhite.png";
import wordmarkSand from "@/assets/logos/wordmark-sand.png";
import wordmarkBlush from "@/assets/logos/wordmark-blush.png";

const SOURCES = {
  "umark-offwhite": umarkOffwhite,
  "umark-dark": umarkDark,
  "umark-sand": umarkSand,
  "umark-rose": umarkRose,
  "umark-blush": umarkBlush,
  "wordmark-dark": wordmarkDark,
  "wordmark-offwhite": wordmarkOffwhite,
  "wordmark-sand": wordmarkSand,
  "wordmark-blush": wordmarkBlush,
} as const;

export type LogoVariant = keyof typeof SOURCES;

/**
 * GLYPH_METRICS
 * --------------
 * Each PNG is 2000x2000 with a lot of transparent padding around the actual
 * mark. These numbers (measured from the alpha bbox of each asset) describe
 * where the visible glyph sits inside the canvas. The component uses them to
 * crop the whitespace at render time so callers can size logos by their
 * VISIBLE height — not by the bloated PNG canvas.
 *
 *   hRatio       = glyph height / canvas height
 *   wRatio       = glyph width  / canvas width
 *   centerYPct   = vertical center of the glyph as % of canvas height (50 = middle)
 *   centerXPct   = horizontal center of the glyph as % of canvas width
 */
const GLYPH_METRICS: Record<
  LogoVariant,
  { hRatio: number; wRatio: number; centerYPct: number; centerXPct: number }
> = {
  "umark-offwhite": { hRatio: 0.340, wRatio: 0.424, centerYPct: 49.90, centerXPct: 54.95 },
  "umark-dark":     { hRatio: 0.344, wRatio: 0.430, centerYPct: 50.13, centerXPct: 55.13 },
  "umark-sand":     { hRatio: 0.344, wRatio: 0.429, centerYPct: 50.03, centerXPct: 55.18 },
  "umark-rose":     { hRatio: 0.341, wRatio: 0.425, centerYPct: 49.90, centerXPct: 55.05 },
  "umark-blush":    { hRatio: 0.581, wRatio: 0.581, centerYPct: 50.03, centerXPct: 50.03 },
  "wordmark-dark":     { hRatio: 0.1585, wRatio: 0.6045, centerYPct: 45.52, centerXPct: 50.02 },
  "wordmark-offwhite": { hRatio: 0.1575, wRatio: 0.5990, centerYPct: 50.08, centerXPct: 50.00 },
  "wordmark-sand":     { hRatio: 0.1600, wRatio: 0.6075, centerYPct: 46.10, centerXPct: 51.52 },
  "wordmark-blush":    { hRatio: 0.1575, wRatio: 0.6000, centerYPct: 42.98, centerXPct: 50.15 },
};

export function Logo({
  variant = "umark-offwhite",
  size = 40,
  className = "",
}: {
  variant?: LogoVariant;
  /** Visible glyph height in pixels. Width derives from the glyph's aspect ratio. */
  size?: number;
  className?: string;
}) {
  const m = GLYPH_METRICS[variant];

  // Visible wrapper dimensions = the glyph itself, no transparent padding.
  const wrapperHeight = size;
  const wrapperWidth = size * (m.wRatio / m.hRatio);

  // Inner image is scaled so its rendered glyph height equals `size`.
  const imageHeight = size / m.hRatio;
  const imageWidth = imageHeight; // canvas is square (2000x2000)

  // Translate the image so the glyph's center aligns with the wrapper's center.
  // Glyph center is at centerYPct% of the image; wrapper center is at 50%.
  // Offset (in % of image height) = 50 - centerYPct  (positive = move image down).
  const offsetYPct = 50 - m.centerYPct;
  const offsetXPct = 50 - m.centerXPct;

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{
        height: `${wrapperHeight}px`,
        width: `${wrapperWidth}px`,
        overflow: "hidden",
      }}
      aria-label="UniPlug"
      role="img"
    >
      <img
        src={SOURCES[variant]}
        alt=""
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          height: `${imageHeight}px`,
          width: `${imageWidth}px`,
          maxWidth: "none",
          display: "block",
          transform: `translate(calc(-50% + ${offsetXPct}%), calc(-50% + ${offsetYPct}%))`,
        }}
      />
    </div>
  );
}

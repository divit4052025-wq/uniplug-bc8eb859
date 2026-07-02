// Sky gradients for the two waitlist hero worlds — the SINGLE source of the sky
// stops, shared by the heavy three.js engine (hero3d-engine.ts) and the light
// CSS-sky fallback the boundary paints. This module imports NO three.js, so the
// boundary / SSR path can use it without pulling the WebGL chunk into the bundle.

export type HeroWorldName = "quarter" | "headquarters";

/** [offset 0..1, color] stops, top → bottom. */
export const HERO_SKY: Record<HeroWorldName, ReadonlyArray<readonly [number, string]>> = {
  quarter: [
    [0, "#9DBCDA"],
    [0.42, "#D9B2BE"],
    [0.72, "#F2B6A0"],
    [1, "#F8CFB4"],
  ],
  headquarters: [
    [0, "#8FB0CC"],
    [0.32, "#DDB07E"],
    [0.64, "#ECC791"],
    [1, "#F3D7A8"],
  ],
};

/** The exact CSS the engine sets on its host, so the fallback matches the scene. */
export function heroSkyGradientCss(world: HeroWorldName): string {
  const stops = HERO_SKY[world] ?? HERO_SKY.quarter;
  return (
    "linear-gradient(180deg," +
    stops.map((s) => `${s[1]} ${Math.round(s[0] * 100)}%`).join(",") +
    ")"
  );
}

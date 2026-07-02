import { Suspense, lazy, useEffect, useState } from "react";

import { heroSkyGradientCss, type HeroWorldName } from "./hero-sky";

/**
 * WaitlistHero3D — the SSR-safe, client-only lazy boundary for a waitlist hero.
 *
 * Mirrors the dashboards' Quarter3DBoundary/Hq3DBoundary recipe so three.js
 * never evaluates on the Cloudflare Worker (workerd) at SSR import time or in
 * the initial client paint:
 *  - The scene is reached ONLY via React.lazy(() => import("./WaitlistHeroScene")).
 *    The factory is created at module load but not invoked until the lazy element
 *    renders — which only happens after mount on a WebGL-capable device.
 *  - `mode` starts "ssr" so the server AND the first client paint render the
 *    identical CSS-sky fallback → no hydration mismatch.
 *  - After mount: "live" (WebGL present — including small/coarse screens, which
 *    the engine renders as a lighter scene) loads the scene; "static" (no WebGL)
 *    keeps the CSS-sky fallback. Reduced-motion is handled inside the engine
 *    (a single static frame), so it still goes "live".
 */
function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

/** The always-present CSS sky — the fallback AND the no-WebGL final state. */
function HeroSky({ world }: { world: HeroWorldName }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        background: heroSkyGradientCss(world),
      }}
    />
  );
}

export function WaitlistHero3D({ world }: { world: HeroWorldName }) {
  const [mode, setMode] = useState<"ssr" | "live" | "static">("ssr");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setMode(detectWebGL() ? "live" : "static");
  }, []);

  if (mode !== "live") return <HeroSky world={world} />;

  return (
    <Suspense fallback={<HeroSky world={world} />}>
      <WaitlistHeroScene world={world} />
    </Suspense>
  );
}

// Lazy import at module scope — factory created, not invoked, so no three.js
// evaluation until <WaitlistHeroScene/> first renders above.
const WaitlistHeroScene = lazy(() => import("./WaitlistHeroScene"));

import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";

/**
 * Hq3DBoundary — the reusable SSR-safe, client-only lazy boundary for WebGL.
 *
 * Why this exists: the repo has ZERO code-splitting and runs SSR on Cloudflare
 * Workers (workerd). A top-level `import` of three / @react-three/fiber would be
 * evaluated by workerd at SSR import time (three touches self/window/WebGL) and
 * bloat the initial client bundle. The SignupCursor "guard window access in
 * useEffect" pattern is necessary but NOT sufficient here, because the heavy
 * MODULE must also stay out of server evaluation entirely.
 *
 * The recipe:
 *  - The scene is reached ONLY via React.lazy(() => import("./Hq3DScene")). The
 *    import factory is not invoked until the lazy element is actually rendered,
 *    which only happens after mount on a capable device → three never loads on
 *    the server or in the initial paint.
 *  - `mode` starts "ssr" so the server AND the first client paint both render the
 *    identical `fallback` → no hydration mismatch.
 *  - After mount we branch: "live" (desktop + WebGL) loads the scene; "static"
 *    (small / coarse / no-WebGL) keeps the fallback as the full experience.
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

export function Hq3DBoundary({ fallback }: { fallback: ReactNode }) {
  const [mode, setMode] = useState<"ssr" | "live" | "static">("ssr");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setMode(desktop && detectWebGL() ? "live" : "static");
  }, []);

  if (mode !== "live") return <>{fallback}</>;

  return (
    <Suspense fallback={fallback}>
      <Hq3DScene reducedMotion={reducedMotion} />
    </Suspense>
  );
}

// Lazy import lives at module scope (the factory is created, not invoked, so no
// three.js evaluation happens until <Hq3DScene/> is first rendered above).
const Hq3DScene = lazy(() => import("./Hq3DScene"));

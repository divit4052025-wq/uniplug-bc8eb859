import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";

import type { Hq3DSceneProps } from "./Hq3DScene";

/**
 * Hq3DBoundary — the reusable SSR-safe, client-only lazy boundary for WebGL.
 *
 * The repo has ZERO code-splitting and runs SSR on Cloudflare Workers (workerd).
 * A top-level `import` of three.js would be evaluated by workerd at SSR import
 * time and bloat the initial client bundle. The recipe:
 *  - The scene is reached ONLY via React.lazy(() => import("./Hq3DScene")). The
 *    import factory is not invoked until the lazy element renders, which only
 *    happens after mount on a capable device → three never loads on the server
 *    or in the initial paint.
 *  - `mode` starts "ssr" so the server AND the first client paint render the
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

export function Hq3DBoundary({ fallback, scene }: { fallback: ReactNode; scene: Hq3DSceneProps }) {
  const [mode, setMode] = useState<"ssr" | "live" | "static">("ssr");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    setMode(desktop && detectWebGL() ? "live" : "static");
  }, []);

  if (mode !== "live") return <>{fallback}</>;

  return (
    <Suspense fallback={fallback}>
      <Hq3DScene {...scene} />
    </Suspense>
  );
}

// Lazy import lives at module scope (the factory is created, not invoked, so no
// three.js evaluation happens until <Hq3DScene/> is first rendered above).
const Hq3DScene = lazy(() => import("./Hq3DScene"));

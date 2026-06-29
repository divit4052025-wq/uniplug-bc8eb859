import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";

import type { Quarter3DSceneProps } from "./Quarter3DScene";

/**
 * Quarter3DBoundary — the SSR-safe, client-only lazy boundary for the student
 * Quarter's WebGL world. Mirrors the mentor Headquarters' Hq3DBoundary.
 *
 * The repo runs SSR on Cloudflare Workers (workerd). A top-level `import` of
 * three.js would be evaluated by workerd at SSR import time and bloat the
 * initial client bundle. The recipe:
 *  - The scene is reached ONLY via React.lazy(() => import("./Quarter3DScene")).
 *    The import factory is created at module load but not invoked until the lazy
 *    element renders, which only happens after mount on a capable device → three
 *    never loads on the server or in the initial paint (code-split chunk).
 *  - `mode` starts "ssr" so the server AND the first client paint render the
 *    identical `fallback` → no hydration mismatch.
 *  - After mount we branch: "live" (desktop + WebGL) loads the scene; "static"
 *    (small / coarse / no-WebGL) keeps the fallback — the persistent dock is the
 *    full navigation there.
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

export function Quarter3DBoundary({
  fallback,
  scene,
}: {
  fallback: ReactNode;
  scene: Quarter3DSceneProps;
}) {
  const [mode, setMode] = useState<"ssr" | "live" | "static">("ssr");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    setMode(desktop && detectWebGL() ? "live" : "static");
  }, []);

  if (mode !== "live") return <>{fallback}</>;

  return (
    <Suspense fallback={fallback}>
      <Quarter3DScene {...scene} />
    </Suspense>
  );
}

// Lazy import lives at module scope (the factory is created, not invoked, so no
// three.js evaluation happens until <Quarter3DScene/> is first rendered above).
const Quarter3DScene = lazy(() => import("./Quarter3DScene"));

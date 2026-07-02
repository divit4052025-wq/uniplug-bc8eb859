import { useEffect, useRef } from "react";

import { initHeroWorld, type HeroWorldName } from "./hero3d-engine";

/**
 * WaitlistHeroScene — the heavy WebGL wrapper for a waitlist hero world.
 *
 * The ONLY React module that reaches the three.js engine, and it is reached
 * EXCLUSIVELY via React.lazy(() => import(...)) inside WaitlistHero3D — so
 * three.js lands in its own code-split chunk, never in the SSR worker bundle or
 * the landing/initial paint. Default export so React.lazy can consume it.
 *
 * The engine paints the CSS sky on the host immediately and mounts its own
 * canvas, and handles reduced-motion (single static frame) + small/coarse
 * (lighter scene) internally.
 */
export default function WaitlistHeroScene({ world }: { world: HeroWorldName }) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const handle = initHeroWorld(mountRef.current, { world });
    return () => handle.dispose();
  }, [world]);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}

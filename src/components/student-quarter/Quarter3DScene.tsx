import { useEffect, useRef } from "react";

import { init as initQuarterScene, type QuarterSceneApi, type QuarterState } from "./world/scene";
import type { TimeName } from "./world/kit";

/**
 * Quarter3DScene — the heavy WebGL module for the student "Quarter".
 *
 * Thin React wrapper around the imperative three.js engine (./world/scene),
 * mirroring the mentor Headquarters' Hq3DScene. The prototype's engine is
 * imperative (its own renderer, camera, OrbitControls, rAF loop and DOM label
 * overlay), so we mount it into a div rather than re-modelling it declaratively
 * — preserving the prototype's exact look and behaviour (three.js r128).
 *
 * It is the ONLY module that pulls in three.js, reached EXCLUSIVELY through
 * React.lazy(() => import(...)) inside Quarter3DBoundary, so three never lands
 * in the Cloudflare Worker SSR bundle or the initial paint. Default export so
 * React.lazy can consume it.
 */
export interface Quarter3DSceneProps {
  state: QuarterState;
  time: TimeName;
  motion?: boolean;
  onEnter?: (zoneId: string) => void;
  onLocked?: (zoneId: string) => void;
}

export default function Quarter3DScene({
  state,
  time,
  motion = true,
  onEnter,
  onLocked,
}: Quarter3DSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<QuarterSceneApi | null>(null);
  // Keep the latest callbacks without re-initialising the (expensive) scene.
  const enterRef = useRef(onEnter);
  const lockedRef = useRef(onLocked);
  enterRef.current = onEnter;
  lockedRef.current = onLocked;

  useEffect(() => {
    if (!mountRef.current) return;
    const api = initQuarterScene(mountRef.current, {
      time,
      state,
      onEnter: (id) => enterRef.current?.(id),
      onLocked: (id) => lockedRef.current?.(id),
    });
    apiRef.current = api;
    // Dev-only handle so the world can be driven from the console during review
    // (e.g. window.__Q_API.setTime("midday")). Never present in production.
    if (import.meta.env.DEV) (window as { __Q_API?: typeof api }).__Q_API = api;
    return () => {
      api.dispose();
      apiRef.current = null;
    };
    // Build once; live updates flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live updates without a rebuild.
  useEffect(() => {
    apiRef.current?.setState(state);
  }, [state]);
  useEffect(() => {
    apiRef.current?.setTime(time);
  }, [time]);
  useEffect(() => {
    apiRef.current?.setMotion(motion);
  }, [motion]);

  return <div ref={mountRef} className="absolute inset-0" />;
}

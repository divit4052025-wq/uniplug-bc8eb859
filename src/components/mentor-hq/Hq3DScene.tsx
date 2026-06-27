import { useEffect, useRef } from "react";

import { initHqScene, type HqSceneApi, type WorldState, type ZoneInfo } from "./world/hqScene";
import type { TimeName } from "./world/hqKit";

/**
 * Hq3DScene — the heavy WebGL module for the mentor "Headquarters".
 *
 * This is a thin React wrapper around the imperative three.js engine
 * (./world/hqScene). The prototype's engine is imperative (its own renderer,
 * camera, OrbitControls, rAF loop and DOM label overlay), so we mount it into a
 * div rather than re-modelling it declaratively — preserving the prototype's
 * exact look and behaviour.
 *
 * It is the ONLY module that pulls in three.js, reached EXCLUSIVELY through
 * React.lazy(() => import(...)) inside Hq3DBoundary, so three never lands in the
 * Cloudflare Worker SSR bundle or the initial paint. Default export so
 * React.lazy can consume it.
 */
export interface Hq3DSceneProps {
  state: WorldState;
  time: TimeName;
  zoneInfo?: Record<string, ZoneInfo>;
  onEnter?: (zoneId: string) => void;
  onLocked?: (zoneId: string) => void;
}

export default function Hq3DScene({ state, time, zoneInfo, onEnter, onLocked }: Hq3DSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<HqSceneApi | null>(null);
  // Keep the latest callbacks without re-initialising the (expensive) scene.
  const enterRef = useRef(onEnter);
  const lockedRef = useRef(onLocked);
  enterRef.current = onEnter;
  lockedRef.current = onLocked;

  useEffect(() => {
    if (!mountRef.current) return;
    const api = initHqScene(mountRef.current, {
      theme: "mix", // Stone-craft (locked decision Q1)
      time,
      state,
      zoneInfo,
      onEnter: (id) => enterRef.current?.(id),
      onLocked: (id) => lockedRef.current?.(id),
    });
    apiRef.current = api;
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
    if (zoneInfo) apiRef.current?.setZoneInfo(zoneInfo);
  }, [zoneInfo]);

  return <div ref={mountRef} className="absolute inset-0" />;
}

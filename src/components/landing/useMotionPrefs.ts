import { useEffect, useState } from "react";

/**
 * True when the user has asked for reduced motion. SSR-safe: defaults to false
 * on the server / first paint, then corrects on mount. All decorative motion on
 * the welcome route is additionally neutralised in CSS, so this is only used to
 * branch JS-driven effects (custom cursor, magnetic CTAs, splash timing).
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * True only on devices with a precise pointer AND hover (desktop) — never touch.
 * Gates the custom cursor and magnetic CTAs so they never run on phones/tablets.
 * SSR-safe: defaults to false until mount confirms the environment.
 */
export function usePointerFine(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: fine) and (hover: hover)");
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return fine;
}

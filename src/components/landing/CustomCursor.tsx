import { useEffect, useRef } from "react";
import { usePointerFine, usePrefersReducedMotion } from "./useMotionPrefs";

/**
 * A soft custom cursor for the welcome route: a small solid dot that tracks the
 * pointer 1:1 plus a larger ring that trails with easing and swells over
 * interactive elements. Desktop pointer-fine only; never on touch; fully off
 * under prefers-reduced-motion. The native cursor is hidden only while active.
 */
export function CustomCursor() {
  const fine = usePointerFine();
  const reduced = usePrefersReducedMotion();
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const active = fine && !reduced;

  useEffect(() => {
    if (!active) return;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    const docEl = document.documentElement;
    docEl.classList.add("uniplug-cursor-on");

    let rx = window.innerWidth / 2;
    let ry = window.innerHeight / 2;
    let mx = rx;
    let my = ry;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`;
      const target = e.target as Element | null;
      const interactive = !!target?.closest(
        "a, button, [role='button'], [data-cursor='magnetic'], summary",
      );
      ring.dataset.hover = interactive ? "true" : "false";
    };

    const loop = () => {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(loop);
    };

    const show = () => {
      dot.style.opacity = "1";
      ring.style.opacity = "1";
    };
    const hide = () => {
      dot.style.opacity = "0";
      ring.style.opacity = "0";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerenter", show);
    document.addEventListener("pointerleave", hide);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerenter", show);
      document.removeEventListener("pointerleave", hide);
      docEl.classList.remove("uniplug-cursor-on");
    };
  }, [active]);

  if (!active) return null;

  return (
    <>
      <div ref={ringRef} aria-hidden="true" className="uniplug-cursor-ring" />
      <div ref={dotRef} aria-hidden="true" className="uniplug-cursor-dot" />
    </>
  );
}

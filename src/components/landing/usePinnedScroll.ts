import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "./useMotionPrefs";

/**
 * The pinned-scroll engine — a faithful, dependency-free port of the design's
 * `pinSeq()`. Attach the returned ref to `.pin-wrap`. Inside it must be a
 * `.pin-stage` containing the `.panel` scenes (panels may carry `data-steps="N"`
 * for multi-beat reveals, and descendants may carry `data-step-show`/
 * `data-step-only`).
 *
 * Mechanism: the wrap is made tall (TOTAL steps × 128vh) to create scroll
 * distance; CSS makes `.pin-stage` `position:sticky` (only when the root has
 * `.pin-on`). A passive scroll listener converts the wrap's viewport offset into
 * a 0→1 progress fraction, quantises it to an integer step (`floor(p*TOTAL)`),
 * maps that to `(panelIndex, localStep)`, and toggles class names only —
 * `is-active`/`is-prev`/`is-next` on panels, `shown` + `data-step` on sub-steps,
 * and `welcome-panel-dark` on <body> for the dark scenes. ALL transforms live in
 * CSS.
 *
 * Progressive enhancement + SSR safety:
 *  - Everything runs in `useEffect` (client only); nothing touches window during
 *    render.
 *  - Under `prefers-reduced-motion`, `.pin-on` is never added, so CSS falls back
 *    to a normal stacked full-height scroll — and the same is true with JS
 *    disabled (the class is only ever added here).
 */
export function usePinnedScroll<T extends HTMLElement = HTMLDivElement>() {
  const wrapRef = useRef<T>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return; // stacked fallback — no pinning
    const wrap = wrapRef.current;
    if (!wrap) return;
    const root = wrap.closest<HTMLElement>(".welcome-root");
    const stage = wrap.querySelector<HTMLElement>(".pin-stage");
    const panels = Array.from(wrap.querySelectorAll<HTMLElement>(".panel"));
    if (!root || !stage || panels.length === 0) return;

    const STEP_VH = 128;
    const stepsArr = panels.map((p) => Math.max(1, parseInt(p.dataset.steps || "1", 10)));
    const starts: number[] = [];
    let acc = 0;
    for (const s of stepsArr) {
      starts.push(acc);
      acc += s;
    }
    const TOTAL = acc;

    root.classList.add("pin-on");
    const setH = () => {
      wrap.style.height = `${TOTAL * STEP_VH}vh`;
    };

    const setActive = (pi: number, localStep: number) => {
      panels.forEach((panel, idx) => {
        panel.classList.toggle("is-active", idx === pi);
        panel.classList.toggle("is-prev", idx < pi);
        panel.classList.toggle("is-next", idx > pi);
      });
      const panel = panels[pi];
      panel.querySelectorAll<HTMLElement>("[data-step-show]").forEach((el) => {
        el.classList.toggle("shown", localStep >= parseInt(el.dataset.stepShow || "0", 10));
      });
      panel.querySelectorAll<HTMLElement>("[data-step-only]").forEach((el) => {
        el.classList.toggle("shown", localStep === parseInt(el.dataset.stepOnly || "0", 10));
      });
      panel.setAttribute("data-step", String(localStep));
      document.body.classList.toggle("welcome-panel-dark", panel.classList.contains("on-dark"));
    };

    let raf = 0;
    const compute = () => {
      raf = 0;
      const vh = window.innerHeight;
      const total = wrap.offsetHeight - vh;
      const top = wrap.getBoundingClientRect().top;
      const scrolled = Math.min(Math.max(-top, 0), total);
      const p = total > 0 ? scrolled / total : 0;
      let g = Math.floor(p * TOTAL);
      if (g < 0) g = 0;
      if (g > TOTAL - 1) g = TOTAL - 1;
      let pi = 0;
      while (pi < panels.length - 1 && g >= starts[pi] + stepsArr[pi]) pi++;
      setActive(pi, g - starts[pi]);
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    const onResize = () => {
      setH();
      onScroll();
    };

    setH();
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
      root.classList.remove("pin-on");
      document.body.classList.remove("welcome-panel-dark");
      wrap.style.height = "";
      panels.forEach((p) => p.classList.remove("is-active", "is-prev", "is-next"));
    };
  }, [reduced]);

  return wrapRef;
}

// Student-signup v2 — the landing magnetic cursor, ported to a client-only React
// component. A rose dot follows the pointer 1:1; a ring stays hidden until it
// hovers an interactive/[data-mag] element, then snaps + morphs to that element's
// bbox/border-radius and the element is magnetically pulled toward the pointer.
// Colours flip to the bright on-dark rose over any [data-dark] region.
//
// SSR-safe (Cloudflare Workers): the two nodes render identically on server +
// client (no hydration mismatch); ALL window/rAF/matchMedia access lives in a
// useEffect guarded by `typeof window`. Disabled on coarse pointers and under
// prefers-reduced-motion, where the OS cursor stays visible (base-visible).
import { useEffect, useRef } from "react";

export function SignupCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dot = dotRef.current;
    const ring = ringRef.current;
    // Show the custom cursor on ANY fine pointer — it REPLACES the OS cursor the
    // wizard hides, so we must NOT bail on reduced-motion (that would leave no
    // visible pointer). Under reduced-motion the ring snaps instantly (loop below).
    if (!fine || !dot || !ring) return;

    // Hide the OS cursor only while the custom one is active (and only here).
    document.body.classList.add("up-cursor-active");

    let rx = window.innerWidth / 2;
    let ry = window.innerHeight / 2;
    let mx = rx;
    let my = ry;
    let snapped = false;
    let pressing = false;
    let curMag: HTMLElement | null = null;
    let raf = 0;

    const sizeDot = (hov: boolean) => {
      const d = pressing ? 16 : hov ? 6 : 11;
      dot.style.width = `${d}px`;
      dot.style.height = `${d}px`;
    };

    const move = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;

      const t = e.target as Element | null;
      const mag = (t?.closest?.("[data-mag]") as HTMLElement | null) ?? null;
      const hov = !!t?.closest?.("[data-mag],[data-hov],a,button,input,textarea,select,label");
      const dark = !!t?.closest?.("[data-dark]");

      dot.style.background = dark ? "var(--brand-rose)" : "var(--primary)";
      ring.style.borderColor = dark ? "var(--brand-rose)" : "var(--primary)";
      sizeDot(hov);

      if (mag) {
        if (curMag && curMag !== mag) curMag.style.transform = "";
        curMag = mag;
        snapped = true;
        const r = mag.getBoundingClientRect();
        ring.style.opacity = "1";
        ring.style.width = `${r.width + 12}px`;
        ring.style.height = `${r.height + 12}px`;
        ring.style.borderRadius = getComputedStyle(mag).borderRadius;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        ring.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%) scale(1)`;
        const pull = Math.min(r.width, 150) * 0.12;
        mag.style.transform = `translate(${((e.clientX - cx) / r.width) * pull}px, ${
          ((e.clientY - cy) / r.height) * pull
        }px)`;
      } else {
        if (curMag) {
          curMag.style.transform = "";
          curMag = null;
        }
        snapped = false;
        ring.style.width = "38px";
        ring.style.height = "38px";
        ring.style.borderRadius = "50%";
        ring.style.opacity = hov ? "1" : "0";
      }
    };

    const down = () => {
      pressing = true;
      dot.style.width = "16px";
      dot.style.height = "16px";
    };
    const up = () => {
      pressing = false;
    };

    const loop = () => {
      if (!snapped) {
        const f = reduce ? 1 : 0.18;
        rx += (mx - rx) * f;
        ry += (my - ry) * f;
        const s = ring.style.opacity === "1" ? 1 : 0.5;
        ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%) scale(${s})`;
      } else {
        rx = mx;
        ry = my;
      }
      raf = window.requestAnimationFrame(loop);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    loop();

    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
      window.cancelAnimationFrame(raf);
      if (curMag) curMag.style.transform = "";
      document.body.classList.remove("up-cursor-active");
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 9000,
          pointerEvents: "none",
          width: 11,
          height: 11,
          borderRadius: "50%",
          background: "var(--primary)",
          transform: "translate(-50%, -50%)",
          transition: "width .25s, height .25s, background .25s",
        }}
      />
      <div
        ref={ringRef}
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 9000,
          pointerEvents: "none",
          width: 38,
          height: 38,
          borderRadius: "50%",
          border: "1.5px solid var(--primary)",
          transform: "translate(-50%, -50%) scale(.5)",
          opacity: 0,
          transition:
            "opacity .25s, width .3s cubic-bezier(0.32,0.72,0,1), height .3s cubic-bezier(0.32,0.72,0,1), border-radius .3s, border-color .25s",
        }}
      />
    </>
  );
}

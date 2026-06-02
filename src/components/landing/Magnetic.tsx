import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePointerFine, usePrefersReducedMotion } from "./useMotionPrefs";

/**
 * Wraps a single interactive child (CTA) and pulls it gently toward the pointer
 * while hovered — the "magnetic" feel. Desktop pointer-fine only; disabled on
 * touch and under prefers-reduced-motion (where it renders an inert wrapper).
 */
export function Magnetic({
  children,
  strength = 0.28,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const fine = usePointerFine();
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const enabled = fine && !reduced;

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate3d(${x * strength}px, ${y * strength}px, 0)`;
    };
    const reset = () => {
      el.style.transform = "translate3d(0, 0, 0)";
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", reset);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", reset);
      reset();
    };
  }, [enabled, strength]);

  return (
    <span
      ref={ref}
      data-cursor="magnetic"
      className={cn(
        "inline-flex transition-transform duration-200 ease-out [will-change:transform] motion-reduce:!transform-none",
        className,
      )}
    >
      {children}
    </span>
  );
}

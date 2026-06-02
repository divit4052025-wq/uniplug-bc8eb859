import { useEffect, useRef } from "react";

/**
 * Attach the returned ref to a container; any descendant marked with
 * `data-reveal` ("up" | "down" | "left" | "right" | "scale") animates into place
 * the first time it scrolls into view. Elements that are already in view on mount
 * (e.g. the hero) reveal immediately, giving the orchestrated page-load moment.
 *
 * Progressive enhancement + a11y:
 *  - The hidden start state lives in CSS, gated so reduced-motion shows everything
 *    at its final state with no transition.
 *  - If IntersectionObserver is unavailable, everything reveals immediately.
 *  - Content is always present in the SSR'd DOM (only opacity/transform change),
 *    so it stays crawlable and is never display:none.
 */
export function useRevealRoot<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (targets.length === 0) return;

    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("is-revealed"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

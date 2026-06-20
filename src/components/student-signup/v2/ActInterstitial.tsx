// Student-signup v2 — kinetic-typography act interstitial (the dark beat between
// acts: "Now — let's talk about your dreams." etc.). GSAP SplitText splits the
// line into characters and rises them in with a stagger; the beat auto-advances
// after ~1.4s and is click-to-skip.
//
// SSR-safe (Cloudflare Workers): the words render as plain, readable text on the
// server; GSAP + SplitText only run inside a useEffect guarded by `typeof window`.
// Under prefers-reduced-motion we skip the split/animation entirely — the static
// words are the base-visible state — and still auto-advance.
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";

export interface InterstitialWord {
  text: string;
  /** A CSS colour token, e.g. "var(--brand-rose)" for the accent word. */
  color: string;
}

export function ActInterstitial({
  words,
  onDone,
  durationMs = 1400,
}: {
  words: InterstitialWord[];
  onDone: () => void;
  durationMs?: number;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = headingRef.current;
    let split: SplitText | null = null;
    let tween: gsap.core.Tween | null = null;

    if (el && !reduce) {
      gsap.registerPlugin(SplitText);
      split = new SplitText(el, { type: "words,chars" });
      tween = gsap.from(split.chars, {
        yPercent: 90,
        opacity: 0,
        rotate: 2,
        ease: "expo.out",
        duration: 0.7,
        stagger: 0.018,
      });
    }

    const timer = window.setTimeout(onDone, durationMs);
    return () => {
      window.clearTimeout(timer);
      tween?.kill();
      split?.revert();
    };
  }, [onDone, durationMs, words]);

  return (
    <div
      data-dark
      data-hov
      onClick={onDone}
      role="button"
      tabIndex={0}
      aria-label="Continue"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onDone();
      }}
      className="absolute inset-0 z-[70] flex cursor-none items-center justify-center bg-brand-night text-brand-paper"
    >
      <h2
        ref={headingRef}
        className="m-0 max-w-[18ch] px-[8vw] text-center font-display text-[clamp(34px,6vw,60px)] font-extrabold leading-[1.04] tracking-[-0.025em]"
      >
        {words.map((w, i) => (
          <span key={i} style={{ color: w.color }}>
            {w.text}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </h2>
    </div>
  );
}

import { useEffect, useRef } from "react";

import { Mascot } from "@/components/mascots/Mascot";
import { MASCOTS } from "@/components/mascots/mascot-data";
import wm1U from "@/assets/landing/wordmark/wm-1-U.png";
import wm2n from "@/assets/landing/wordmark/wm-2-n.png";
import wm3i from "@/assets/landing/wordmark/wm-3-i.png";
import wm4P from "@/assets/landing/wordmark/wm-4-P.png";
import wm5l from "@/assets/landing/wordmark/wm-5-l.png";
import wm6u from "@/assets/landing/wordmark/wm-6-u.png";
import wm7g from "@/assets/landing/wordmark/wm-7-g.png";

/** Per-letter positions of the "UniPlug" wordmark (verbatim from the design). */
const LETTERS = [
  { src: wm1U, left: "0%", width: "16.94%", k: "U" },
  { src: wm2n, left: "16.94%", width: "14.21%", k: "n" },
  { src: wm3i, left: "31.16%", width: "7.11%", k: "i" },
  { src: wm4P, left: "38.26%", width: "17.27%", k: "P" },
  { src: wm5l, left: "55.54%", width: "7.11%", k: "l" },
  { src: wm6u, left: "62.64%", width: "14.21%", k: "u" },
  { src: wm7g, left: "76.86%", width: "15.54%", k: "g" },
];

const SEEN_KEY = "uniplug_welcome_splash_seen";

/**
 * The opening title sequence. The "UniPlug" letters drop in one at a time; the
 * Founder flies in carrying the rose dot; the dot snaps into the end of the
 * wordmark with a ripple; the kicker + "click anywhere to enter" cue appear; on
 * click (or after ~6.9s) it dissolves into the hero.
 *
 * Progressive enhancement: the overlay is visible by default so JS users see it
 * with no flash, but the <noscript> block in welcome.tsx hides it entirely when
 * JS is off (no trap — the page is fully readable behind it). Reduced motion
 * shows the assembled rest frame and dissolves shortly after. All window/
 * sessionStorage/matchMedia access is inside the effect (SSR-safe), and every
 * timer is cleared on unmount.
 */
export function SplashIntro() {
  const introRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const intro = introRef.current;
    if (!intro) return;

    let timers: number[] = [];
    let done = false;
    const clearAll = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    };
    const after = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };

    const q = <E extends HTMLElement>(sel: string) => intro.querySelector<E>(sel);
    const letters = Array.from(intro.querySelectorAll<HTMLElement>(".wm-letter"));
    const founder = q<HTMLElement>(".intro-founder");
    const carry = q<HTMLElement>(".intro-carry-dot");
    const home = q<HTMLElement>(".intro-dot-home");
    const kicker = q<HTMLElement>(".intro-kicker");
    const cue = q<HTMLElement>(".intro-cue");
    const skip = q<HTMLButtonElement>(".intro-skip");
    const stage = q<HTMLElement>(".intro-stage");

    const enterPage = () => {
      if (done) return;
      done = true;
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* sessionStorage may be unavailable; non-fatal */
      }
      intro.classList.add("dissolve");
      document.body.classList.remove("welcome-intro-lock");
      skip?.classList.remove("show");
      after(720, () => intro.classList.add("hidden"));
    };

    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen) {
      intro.classList.add("hidden");
      return;
    }

    const onIntroClick = () => {
      clearAll();
      enterPage();
    };
    const onSkipClick = (e: MouseEvent) => {
      e.stopPropagation();
      clearAll();
      enterPage();
    };
    intro.addEventListener("click", onIntroClick);
    skip?.addEventListener("click", onSkipClick);

    const prefersReduced =
      typeof window !== "undefined" &&
      !!window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      intro.classList.add("rest");
      kicker?.classList.add("show");
      cue?.classList.add("show");
      skip?.classList.add("show");
      after(2400, enterPage);
    } else {
      document.body.classList.add("welcome-intro-lock");
      letters.forEach((l, i) => after(120 + i * 70, () => l.classList.add("drop")));
      const lettersDone = 120 + letters.length * 70 + 200; // ~810ms
      after(lettersDone, () => {
        carry?.classList.add("carried");
        if (founder) founder.style.opacity = "1";
        founder?.classList.add("fly");
      });
      const flyDone = lettersDone + 1000; // ~1810ms
      after(flyDone, () => {
        founder?.classList.remove("fly");
        founder?.classList.add("hover");
        carry?.classList.add("drop");
        after(240, () => {
          if (home) home.style.opacity = "1";
          home?.classList.add("settle");
          if (stage) {
            const rip = document.createElement("div");
            rip.className = "intro-ripple";
            stage.appendChild(rip);
            void rip.offsetWidth; // force reflow so the animation restarts
            rip.classList.add("go");
          }
        });
      });
      const placeDone = flyDone + 500; // ~2310ms
      after(placeDone + 200, () => {
        kicker?.classList.add("show");
        cue?.classList.add("show");
        skip?.classList.add("show");
      });
      after(placeDone + 4600, enterPage); // auto-dissolve ~6.9s
    }

    return () => {
      clearAll();
      intro.removeEventListener("click", onIntroClick);
      skip?.removeEventListener("click", onSkipClick);
      document.body.classList.remove("welcome-intro-lock");
    };
  }, []);

  return (
    <div ref={introRef} className="intro" aria-label="UniPlug intro">
      <div className="intro-stage">
        {LETTERS.map((l) => (
          <div key={l.k} className="wm-letter" style={{ left: l.left, width: l.width }}>
            <img src={l.src} alt="" aria-hidden="true" />
          </div>
        ))}
        <div className="intro-dot-home" aria-hidden="true" />
        <div className="intro-founder">
          <div className="intro-carry-dot" aria-hidden="true" />
          <Mascot
            shape="founder"
            color={MASCOTS.founder.color}
            expression="happy"
            size={120}
            decorative
          />
        </div>
        <div className="intro-kicker">Plug into your future</div>
        <div className="intro-cue">Click anywhere to enter</div>
      </div>
      <button type="button" className="intro-skip" aria-label="Skip intro">
        Skip
      </button>
    </div>
  );
}

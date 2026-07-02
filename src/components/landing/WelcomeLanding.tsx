// The UniPlug landing — the single source of the transplanted design, rendered as
// the homepage (/). The design's exact inner <body> markup is server-rendered
// inside #uniplug-welcome; its CSS (scoped to that container by
// scripts/build-welcome-transplant.mjs) and Google Fonts load via the route-scoped
// <link>s in `welcomeLandingLinks`; and its own mascots.js + app.js run on the
// client after mount, so the splash, mascots and pinned scroll are the design's,
// byte-for-byte.
//
// This module is the ONE source of the landing. The index route (/) imports it;
// /welcome is a permanent redirect to /. The landing has its OWN floating pill
// header and NO global Nav/Footer (it simply doesn't render them).
//
// Regenerate the embedded artifacts with: node scripts/build-welcome-transplant.mjs
//   src/welcome-design/welcome-body.html      ← design <body>, paths + CTAs rewritten
//   public/welcome-design/welcome.scoped.css  ← base.css + components.css, prefixed
//   public/welcome-design/{mascots.js,app.js,assets/…} ← raw design files

import { useEffect } from "react";

import welcomeBodyHtml from "@/welcome-design/welcome-body.html?raw";

/** Route-scoped <link>s: the landing fonts + the #uniplug-welcome-scoped design
 *  CSS. Route-scoped + prefixed → never loads globally, never leaks. */
// eslint-disable-next-line react-refresh/only-export-components
export const welcomeLandingLinks = [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Gabarito:wght@500;600;700;800;900&family=Quicksand:wght@400;500;600;700&display=swap",
  },
  { rel: "stylesheet", href: "/welcome-design/welcome.scoped.css" },
];

// The state classes app.js toggles on <body>; the scoped CSS expects them on the
// container, so we mirror them.
const MIRROR_CLASSES = [
  "intro-lock",
  "cursor-on",
  "scrolled",
  "pin-on",
  "panel-dark",
  "no-motion",
  "hovering",
  "pressing",
  "on-dark-cursor",
];

export function WelcomeLanding() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const container = document.getElementById("uniplug-welcome");
    if (!container) return;

    // The design's static <body> ships class="intro-lock cursor-on". app.js
    // manages intro-lock itself but only ever REMOVES cursor-on, so seed it.
    document.body.classList.add("cursor-on");

    // Mirror app.js's <body> state classes onto the container so the prefixed
    // (#uniplug-welcome.*) rules apply, and lock the real page scroll while the
    // splash's intro-lock is active (the scoped overflow rule alone can't).
    const sync = () => {
      for (const c of MIRROR_CLASSES) {
        container.classList.toggle(c, document.body.classList.contains(c));
      }
      document.body.style.overflow = document.body.classList.contains("intro-lock") ? "hidden" : "";
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    // Scroll-lock the landing at both ends: kill the document rubber-band so
    // over-scrolling past the paper hero (top) or the dark closing panel
    // (bottom) never exposes a contrasting sliver of the (near-white) page
    // canvas. Set on the real scroll root (html/body) — the scoped design CSS
    // maps to #uniplug-welcome, which is overflow:visible and not the scroller,
    // so it can't reach here. Landing-only + restored on unmount.
    const root = document.documentElement;
    const prevRootOverscroll = root.style.overscrollBehaviorY;
    const prevBodyOverscroll = document.body.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "none";
    document.body.style.overscrollBehaviorY = "none";

    // Always open on the splash, not a restored scroll position.
    const prevRestore = window.history.scrollRestoration;
    try {
      window.history.scrollRestoration = "manual";
    } catch {
      /* unsupported — non-fatal */
    }
    window.scrollTo(0, 0);

    // Run the design's own scripts as real classic scripts, mascots before app
    // (app.js's mountMascots() needs window.UniPlugMascot). They init synchronously
    // on load against the already-mounted markup.
    const injected: HTMLScriptElement[] = [];
    let cancelled = false;
    const loadScript = (src: string) =>
      new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = false;
        s.dataset.welcomeDesign = "1";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`failed to load ${src}`));
        document.body.appendChild(s);
        injected.push(s);
      });
    loadScript("/welcome-design/mascots.js")
      .then(() => (cancelled ? undefined : loadScript("/welcome-design/app.js")))
      .catch(() => {
        /* network/script error — page still renders its server HTML */
      });

    return () => {
      cancelled = true;
      mo.disconnect();
      injected.forEach((s) => s.remove());
      for (const c of MIRROR_CLASSES) document.body.classList.remove(c);
      document.body.style.overflow = "";
      root.style.overscrollBehaviorY = prevRootOverscroll;
      document.body.style.overscrollBehaviorY = prevBodyOverscroll;
      try {
        window.history.scrollRestoration = prevRestore;
      } catch {
        /* non-fatal */
      }
    };
  }, []);

  // The design's exact <body> markup (server-rendered → crawlable, readable with
  // JS off). React does not reconcile dangerouslySetInnerHTML content, so app.js
  // is free to mutate the DOM inside it. The <noscript> hides the design's fixed
  // splash overlay when JS is off (the splash only dissolves via app.js), so the
  // content behind it stays visible — no effect on the JS-on rendering.
  return (
    <>
      <noscript>
        <style>{`#uniplug-welcome #intro,#uniplug-welcome .intro-skip{display:none!important}`}</style>
      </noscript>
      <div id="uniplug-welcome" dangerouslySetInnerHTML={{ __html: welcomeBodyHtml }} />
    </>
  );
}

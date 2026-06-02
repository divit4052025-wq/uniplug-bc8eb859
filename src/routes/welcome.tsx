// /welcome — the approved UniPlug landing, TRANSPLANTED from the design's own
// files (not a reimplementation). The design's exact inner <body> markup is
// server-rendered inside #uniplug-welcome; its CSS (scoped to that container by
// scripts/build-welcome-transplant.mjs) and Google Fonts load via route-scoped
// <link>s; and its own mascots.js + app.js run on the client after mount, so the
// splash, mascots and pinned scroll are the design's, byte-for-byte.
//
// Pure frontend, isolated to /welcome. The only changes to the design are:
// asset paths (→ /welcome-design/…), CSS scoping (→ #uniplug-welcome), SSR-safety
// (its JS runs client-only), and the two CTAs rewired to the real signup routes.
//
// Source of the embedded artifacts (regenerate with the build script):
//   src/welcome-design/welcome-body.html      ← design <body>, paths + CTAs rewritten
//   public/welcome-design/welcome.scoped.css  ← base.css + components.css, prefixed
//   public/welcome-design/{mascots.js,app.js,assets/…} ← raw design files

import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

import welcomeBodyHtml from "@/welcome-design/welcome-body.html?raw";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome to UniPlug — Plug into your future" },
      {
        name: "description",
        content:
          "Talk to someone who's already there. UniPlug connects school students with university students who've walked the exact road they're on.",
      },
      { property: "og:title", content: "Welcome to UniPlug — Plug into your future" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Gabarito:wght@500;600;700;800;900&family=Quicksand:wght@400;500;600;700&display=swap",
      },
      // The design's own CSS, scoped to #uniplug-welcome. Route-scoped + prefixed,
      // so it neither leaks to other routes nor needs the global stylesheet.
      { rel: "stylesheet", href: "/welcome-design/welcome.scoped.css" },
    ],
  }),
  component: WelcomePage,
});

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

function WelcomePage() {
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
      try {
        window.history.scrollRestoration = prevRestore;
      } catch {
        /* non-fatal */
      }
    };
  }, []);

  // The design's exact <body> markup (server-rendered → crawlable, readable with
  // JS off). React does not reconcile dangerouslySetInnerHTML content, so app.js
  // is free to mutate the DOM inside it.
  return <div id="uniplug-welcome" dangerouslySetInnerHTML={{ __html: welcomeBodyHtml }} />;
}

// /welcome — the approved animated brand landing for UniPlug.
//
// Faithful production port of the signed-off design (UniPlug_LandingPage_Final):
// splash title sequence → floating pill header → hero → pinned scroll sequence
// (Founder quote · The Gap · For Students · For Mentors · Closing). No FAQ, no
// footer — the page ends on the Closing panel.
//
// Scope: PURE frontend, isolated to /welcome. No backend/DB/auth/server-fn. Does
// not touch index.tsx, the global Nav, or shared chrome. Gabarito + Quicksand are
// loaded ONLY here (scoped <link> below) and applied only under .welcome-root, so
// global typography/brand tokens are untouched. All motion is transform/opacity,
// gated by prefers-reduced-motion + degrades to a plain stacked scroll with JS
// off (see welcome.css + the components).

import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { SplashIntro } from "@/components/landing/SplashIntro";
import { CustomCursor } from "@/components/landing/CustomCursor";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Hero } from "@/components/landing/Hero";
import { PinnedSequence } from "@/components/landing/PinnedSequence";
import { useRevealRoot } from "@/components/landing/useReveal";
import "@/components/landing/welcome.css";

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
      {
        property: "og:description",
        content:
          "Your Plug — your word for the person who's been there. Honest, 1:1 guidance for school students applying to university.",
      },
    ],
    // Gabarito + Quicksand, scoped to this route only (applied under .welcome-root).
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Gabarito:wght@500..900&family=Quicksand:wght@400..700&display=swap",
      },
    ],
  }),
  component: WelcomePage,
});

function WelcomePage() {
  const revealRoot = useRevealRoot<HTMLElement>();

  // A landing page should always open on the splash/hero, not a restored scroll
  // position from a previous visit. Disable scroll restoration while here.
  useEffect(() => {
    const prev = window.history.scrollRestoration;
    try {
      window.history.scrollRestoration = "manual";
    } catch {
      /* not supported — non-fatal */
    }
    window.scrollTo(0, 0);
    return () => {
      try {
        window.history.scrollRestoration = prev;
      } catch {
        /* non-fatal */
      }
    };
  }, []);

  return (
    <div className="welcome-root" id="welcome-top">
      {/* Progressive enhancement: with JS off, hide the splash overlay entirely so
          the page behind it is fully readable (no trap). With JS on this is ignored
          and SplashIntro plays/dissolves it. */}
      <noscript>
        <style>{`.welcome-root .intro{display:none!important}.welcome-root [data-reveal]{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      <a
        href="#welcome-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[6001] focus:rounded-lg focus:bg-[#1a1a1a] focus:px-4 focus:py-2 focus:text-[14px] focus:font-medium focus:text-[#faf5ef] focus:shadow"
      >
        Skip to content
      </a>

      <SplashIntro />
      <CustomCursor />
      <LandingHeader />

      <main id="welcome-main" ref={revealRoot}>
        <Hero />
        <PinnedSequence />
      </main>
    </div>
  );
}

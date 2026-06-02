// Home (/) — renders the approved UniPlug landing (the same transplant served
// before at /welcome). The old fake-stats homepage was retired (kept in git
// history). The landing has its OWN floating pill header and NO global Nav/Footer;
// every other route keeps its own chrome unchanged. One source of the landing:
// src/components/landing/WelcomeLanding.tsx.

import { createFileRoute } from "@tanstack/react-router";

import { WelcomeLanding, welcomeLandingLinks } from "@/components/landing/WelcomeLanding";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UniPlug — Your College Plug" },
      {
        name: "description",
        content:
          "Talk to someone who's already there. UniPlug connects Indian school students with university students who've walked the exact road they're on — honest, 1:1 guidance.",
      },
      { property: "og:title", content: "UniPlug — Your College Plug" },
      {
        property: "og:description",
        content: "Your Plug — your word for the person who's been there. Real, 1:1 mentorship.",
      },
    ],
    links: welcomeLandingLinks,
  }),
  component: WelcomeLanding,
});

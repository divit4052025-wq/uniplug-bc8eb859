// /waitlist — the role chooser (CD screen B). Standalone full-screen route; the
// student/mentor pages are un-nested siblings (waitlist_.student / _.mentor), so
// this route is not their layout. Allowlisted in waitlist launch mode.

import { createFileRoute } from "@tanstack/react-router";

import waitlistCss from "@/components/waitlist/waitlist.css?url";
import { WaitlistChooser } from "@/components/waitlist/WaitlistChooser";

export const Route = createFileRoute("/waitlist")({
  head: () => ({
    meta: [
      { title: "Join the UniPlug waitlist" },
      {
        name: "description",
        content:
          "UniPlug is launching soon. Save your place — school students find a Plug, college students become one.",
      },
    ],
    links: [{ rel: "stylesheet", href: waitlistCss }],
  }),
  component: WaitlistChooser,
});
